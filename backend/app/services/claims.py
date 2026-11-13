from datetime import date, timedelta
from decimal import Decimal
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from app.models.entities import *
from app.schemas.claims import ClaimCreate, ClaimUpdate, TRANSITIONS
from app.analytics.metrics import risk_components


def event(db, claim, kind, message, source="Application", user_id=None, details=None):
    db.add(
        ClaimEvent(
            claim_id=claim.id,
            kind=kind,
            message=message,
            source=source,
            details=details or {},
        )
    )
    db.add(
        AuditLog(user_id=user_id, action=kind, entity=claim.id, details=details or {})
    )


def reconcile_records(db, claim, old_paid=Decimal(0), user_id=None):
    if claim.paid_amount > old_paid:
        db.add(
            Payment(
                claim_id=claim.id,
                amount=claim.paid_amount - old_paid,
                payment_date=date.today(),
                recovered=claim.status == "Recovered",
            )
        )
    if claim.denial_reason and not db.scalar(
        select(Denial).where(Denial.claim_id == claim.id)
    ):
        db.add(
            Denial(
                claim_id=claim.id,
                reason=claim.denial_reason,
                amount=claim.expected_reimbursement,
                denial_date=date.today(),
            )
        )
    appeal = db.scalar(
        select(Appeal).where(Appeal.claim_id == claim.id).order_by(Appeal.id.desc())
    )
    if claim.status == "Appealed" and (not appeal or appeal.outcome != "Pending"):
        db.add(Appeal(claim_id=claim.id, filed_date=date.today(), outcome="Pending"))
    if claim.status == "Recovered":
        if appeal:
            appeal.outcome = "Successful"
            appeal.resolved_date = date.today()
        else:
            db.add(
                Appeal(
                    claim_id=claim.id,
                    filed_date=date.today(),
                    resolved_date=date.today(),
                    outcome="Successful",
                )
            )
    if claim.status in ["Denied", "Closed"] and appeal and appeal.outcome == "Pending":
        appeal.outcome = "Unsuccessful"
        appeal.resolved_date = date.today()
    under = db.scalar(select(Underpayment).where(Underpayment.claim_id == claim.id))
    gap = claim.expected_reimbursement - claim.paid_amount
    if claim.status in ["Paid", "Partially Paid"] and claim.paid_amount > 0 and gap > 0:
        if under:
            under.amount = gap
        else:
            db.add(
                Underpayment(claim_id=claim.id, amount=gap, basis=claim.expected_basis)
            )
    elif under:
        db.delete(under)
    thresholds = {"high_value": 10000, "aging_days": 90, "deadline_days": 7}
    if user_id and (user := db.get(User, user_id)):
        thresholds.update(user.preferences.get("thresholds", {}))
    notices = []
    if (
        claim.status == "Denied"
        and claim.expected_reimbursement >= thresholds["high_value"]
    ):
        notices.append(
            ("high_value_denial", "High", "High-value denial requires review")
        )
    if (
        claim.appeal_deadline
        and 0
        <= (claim.appeal_deadline - date.today()).days
        <= thresholds["deadline_days"]
        and claim.status in ["Denied", "Appealed"]
    ):
        notices.append(("appeal_deadline", "Critical", "Appeal deadline approaching"))
    if (
        claim.amount > claim.paid_amount + claim.adjustment
        and (date.today() - claim.submission_date).days > thresholds["aging_days"]
    ):
        notices.append(
            ("aged_claim", "High", "Claim outstanding beyond ageing threshold")
        )
    if under or (claim.status == "Partially Paid" and gap > 0):
        notices.append(
            (
                "underpayment",
                "Medium",
                "Potential underpayment under synthetic contract assumption",
            )
        )
    for kind, priority, title in notices:
        if not db.scalar(
            select(Notification.id).where(
                Notification.claim_id == claim.id, Notification.kind == kind
            )
        ):
            db.add(
                Notification(
                    claim_id=claim.id,
                    title=f"{claim.id}: {title}",
                    priority=priority,
                    kind=kind,
                )
            )


def create_claim(db, data: ClaimCreate, source_id=3, user_id=None):
    if db.get(Claim, data.id):
        raise HTTPException(409, "Claim ID already exists.")
    if not db.get(Payer, data.payer_id) or not db.get(Provider, data.provider_id):
        raise HTTPException(422, "Unknown payer or provider reference.")
    if not db.get(Patient, data.patient_id):
        db.add(Patient(id=data.patient_id))
        db.flush()
    values = data.model_dump()
    if values["expected_reimbursement"] is None:
        values["expected_reimbursement"] = (data.amount * Decimal("0.72")).quantize(
            Decimal("0.01")
        )
    claim = Claim(**values, source_id=source_id)
    db.add(claim)
    db.flush()
    # Synthetic reference codes are independent of real CPT/ICD coding.
    db.add(
        ClaimLine(
            claim_id=claim.id, procedure_id=1, diagnosis_id=1, amount=claim.amount
        )
    )
    reconcile_records(db, claim, user_id=user_id)
    source = db.get(DataSource, source_id)
    source.last_sync = utcnow()
    source.status = "ready"
    event(db, claim, "created", f"Claim created · {claim.status}", source.name, user_id)
    return claim


def update_claim(db, cid, data: ClaimUpdate, user_id):
    claim = db.scalar(select(Claim).where(Claim.id == cid).with_for_update())
    if not claim:
        raise HTTPException(404, "Claim not found.")
    updates = data.model_dump(exclude_unset=True)
    review_fields = {"authorized", "documentation_complete", "eligibility_verified"}
    if claim.status not in ["Draft", "Submitted", "Processing"] and any(
        k in updates and updates[k] != getattr(claim, k) for k in review_fields
    ):
        raise HTTPException(
            422,
            "Submission review flags are locked after adjudication to preserve pre-outcome model inputs. Record follow-up corrections in team notes.",
        )
    if (
        "status" in updates
        and updates["status"] != claim.status
        and updates["status"] not in TRANSITIONS[claim.status]
    ):
        raise HTTPException(
            422, f'Cannot move from {claim.status} to {updates["status"]}.'
        )
    if (
        "amount" in updates
        and updates["amount"] != claim.amount
        and claim.status != "Draft"
    ):
        raise HTTPException(422, "Only draft claim charges can be edited.")
    if (
        updates.get("paid_amount") is not None
        and updates["paid_amount"] < claim.paid_amount
    ):
        raise HTTPException(
            422,
            "Payment reversals require a reconciliation workflow and are not supported in this demo.",
        )
    merged = {
        key: getattr(claim, key)
        for key in ClaimCreate.model_fields
        if hasattr(claim, key)
    }
    merged.update(updates)
    if "amount" in updates and claim.status == "Draft":
        merged["expected_reimbursement"] = (
            updates["amount"] * Decimal(".72")
        ).quantize(Decimal(".01"))
        merged["adjustment"] = (updates["amount"] * Decimal(".28")).quantize(
            Decimal(".01")
        )
    try:
        validated = ClaimCreate(**merged)
    except ValidationError as exc:
        raise HTTPException(422, str(exc.errors()[0]["msg"]))
    old_paid = claim.paid_amount
    old_status = claim.status
    for key, value in validated.model_dump().items():
        setattr(claim, key, value)
    db.flush()
    reconcile_records(db, claim, old_paid, user_id)
    if "amount" in updates:
        line = db.scalar(select(ClaimLine).where(ClaimLine.claim_id == cid))
        line.amount = claim.amount
    event(
        db,
        claim,
        "updated",
        (
            f"{old_status} → {claim.status}"
            if old_status != claim.status
            else "Claim details updated"
        ),
        user_id=user_id,
        details={"fields": list(updates)},
    )
    return claim
