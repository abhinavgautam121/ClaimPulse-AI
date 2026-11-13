"""Reproducible synthetic portfolio data. Never imports clinical patient details."""

from datetime import date, timedelta
from decimal import Decimal
import random, math, secrets
from sqlalchemy import select, func, text
from app.core.database import SessionLocal
from app.core.security import passwords
from app.core.config import settings
from app.models.entities import *
from app.schemas.claims import REASONS

PAYER_NAMES = [
    "Aster Health",
    "Bluecrest Insurance",
    "United Care",
    "Meridian Health",
    "Cigna Demo",
    "Humana Demo",
    "Medicare Demo",
    "Pacific Health",
]
SPECIALTIES = [
    "Cardiology",
    "Orthopaedics",
    "Primary care",
    "Radiology",
    "Neurology",
    "Oncology",
    "Dermatology",
    "Emergency medicine",
    "Gastroenterology",
    "Pulmonology",
]
PROCEDURES = ["Office visit", "Imaging", "Surgery", "Laboratory", "Therapy"]


def seed(count=20000, seed_value=42):
    rng = random.Random(seed_value)
    today = date.today()
    with SessionLocal() as db:
        if db.scalar(select(func.count()).select_from(Claim)):
            return {
                "existing": True,
                "claims": db.scalar(select(func.count()).select_from(Claim)),
            }
        db.add_all([Role(id=1, name="admin"), Role(id=2, name="analyst")])
        db.flush()
        db.add_all(
            [
                User(
                    id=1,
                    email="demo@claimpulse.ai",
                    name="Alex Morgan",
                    role_id=1,
                    password_hash=passwords.hash(secrets.token_urlsafe(32)),
                ),
                User(
                    id=2,
                    email="jordan@claimpulse.ai",
                    name="Jordan Lee",
                    role_id=2,
                    password_hash=passwords.hash(secrets.token_urlsafe(32)),
                ),
                User(
                    id=3,
                    email="sam@claimpulse.ai",
                    name="Sam Rivera",
                    role_id=2,
                    password_hash=passwords.hash(secrets.token_urlsafe(32)),
                ),
            ]
        )
        db.add_all([Payer(id=i + 1, name=n) for i, n in enumerate(PAYER_NAMES)])
        db.add_all(
            [
                Provider(id=i + 1, name=n + " Medical Group", specialty=SPECIALTIES[i])
                for i, n in enumerate(
                    [
                        "Westlake",
                        "Northstar",
                        "Summit",
                        "Evergreen",
                        "Lakeside",
                        "Horizon",
                        "Oakwood",
                        "Riverbend",
                        "Cedar",
                        "Parkview",
                    ]
                )
            ]
        )
        for i, n in enumerate(
            [
                "Synthetic Simulator",
                "Uploaded CSV",
                "Connected API",
                "Webhook Integration",
                "FHIR R4",
                "CMS Reference",
                "NPPES Reference",
            ]
        ):
            db.add(
                DataSource(
                    id=i + 1,
                    name=n,
                    kind=[
                        "simulator",
                        "csv",
                        "rest",
                        "webhook",
                        "fhir",
                        "reference",
                        "reference",
                    ][i],
                    status="ready" if i < 4 else "not_connected",
                    last_sync=utcnow() if i == 0 else None,
                    details={"synthetic_only": True},
                )
            )
        db.add_all(
            [
                Procedure(id=i + 1, code="SYN-P" + str(i + 1), category=n)
                for i, n in enumerate(PROCEDURES)
            ]
        )
        db.add_all(
            [
                Diagnosis(id=i + 1, code="SYN-D" + str(i + 1), category=n)
                for i, n in enumerate(
                    [
                        "General",
                        "Cardiovascular",
                        "Musculoskeletal",
                        "Respiratory",
                        "Metabolic",
                    ]
                )
            ]
        )
        db.add_all([Patient(id=f"SYN-{i:05}") for i in range(1, 5001)])
        db.flush()
        claims = []
        lines = []
        denials = []
        payments = []
        appeals = []
        events = []
        underpayments = []
        notifications = []
        assignments = []
        for i in range(1, count + 1):
            cid = f"CLM-{i:06}"
            payer = rng.randint(1, 8)
            provider = rng.randint(1, 10)
            age = rng.randint(0, 179)
            submitted = today - timedelta(days=age)
            amount = round(min(65000, max(150, rng.lognormvariate(7.6, 0.95))), 2)
            expected = round(amount * 0.72, 2)
            adjustment = round(amount - expected, 2)
            auth = rng.random() > 0.12
            docs = rng.random() > 0.16
            eligible = rng.random() > 0.09
            prior = rng.choices([0, 1, 2, 3], [78, 15, 5, 2])[0]
            p = 1 / (
                1
                + math.exp(
                    -(
                        -3.1
                        + 1.1 * (not auth)
                        + 1.25 * (not docs)
                        + 1.4 * (not eligible)
                        + 0.35 * prior
                        + 0.08 * payer
                        + 0.000009 * amount
                    )
                )
            )
            denied = rng.random() < p
            paid = 0
            reason = None
            deadline = None
            if age < 7 or rng.random() < 0.11:
                status = rng.choices(["Draft", "Submitted", "Processing"], [2, 38, 60])[
                    0
                ]
            elif denied:
                reason = (
                    "Prior authorisation"
                    if not auth
                    else (
                        "Missing documentation"
                        if not docs
                        else (
                            "Eligibility issues"
                            if not eligible
                            else rng.choices(REASONS, [18, 20, 10, 10, 14, 7, 6, 7, 8])[
                                0
                            ]
                        )
                    )
                )
                status = rng.choices(
                    ["Denied", "Appealed", "Recovered", "Closed"], [52, 22, 21, 5]
                )[0]
                deadline = submitted + timedelta(days=90)
                denials.append(
                    {
                        "claim_id": cid,
                        "reason": reason,
                        "amount": expected,
                        "denial_date": submitted + timedelta(days=min(age, 10)),
                    }
                )
                if status in ["Appealed", "Recovered", "Closed"]:
                    outcome = (
                        "Successful"
                        if status == "Recovered"
                        else "Unsuccessful" if status == "Closed" else "Pending"
                    )
                    appeals.append(
                        {
                            "claim_id": cid,
                            "filed_date": submitted + timedelta(days=min(age, 16)),
                            "resolved_date": (
                                submitted + timedelta(days=min(age, 30))
                                if outcome != "Pending"
                                else None
                            ),
                            "outcome": outcome,
                        }
                    )
                if status == "Recovered":
                    paid = expected
                if status == "Closed":
                    adjustment = amount
            else:
                status = rng.choices(
                    ["Paid", "Partially Paid", "Processing"], [79, 13, 8]
                )[0]
                if status == "Paid":
                    paid = expected
                elif status == "Partially Paid":
                    paid = round(expected * rng.uniform(0.48, 0.94), 2)
            if paid:
                payment_date = submitted + timedelta(days=min(age, rng.randint(12, 55)))
                payments.append(
                    {
                        "claim_id": cid,
                        "amount": paid,
                        "payment_date": payment_date,
                        "recovered": status == "Recovered",
                    }
                )
                if status == "Partially Paid":
                    underpayments.append(
                        {
                            "claim_id": cid,
                            "amount": round(expected - paid, 2),
                            "basis": "Synthetic contract assumption: insurer allowed amount = 72% of billed",
                        }
                    )
            proc = rng.randint(1, 5)
            diag = rng.randint(1, 5)
            claims.append(
                dict(
                    id=cid,
                    patient_id=f"SYN-{rng.randint(1,5000):05}",
                    payer_id=payer,
                    provider_id=provider,
                    source_id=1,
                    submission_date=submitted,
                    service_date=submitted - timedelta(days=rng.randint(1, 12)),
                    amount=amount,
                    expected_reimbursement=expected,
                    adjustment=adjustment,
                    paid_amount=paid,
                    status=status,
                    denial_reason=reason,
                    appeal_deadline=deadline,
                    authorized=auth,
                    documentation_complete=docs,
                    eligibility_verified=eligible,
                    prior_denials=prior,
                    procedure_category=PROCEDURES[proc - 1],
                    diagnosis_category=[
                        "General",
                        "Cardiovascular",
                        "Musculoskeletal",
                        "Respiratory",
                        "Metabolic",
                    ][diag - 1],
                    synthetic=True,
                    patient_responsibility=0,
                )
            )
            lines.append(
                dict(claim_id=cid, procedure_id=proc, diagnosis_id=diag, amount=amount)
            )
            events.append(
                dict(
                    claim_id=cid,
                    kind="seeded",
                    message=f"Synthetic claim loaded · {status}",
                    source="Synthetic Simulator",
                    created_at=datetime.combine(
                        submitted, datetime.min.time(), tzinfo=timezone.utc
                    ),
                )
            )
            if status == "Recovered":
                events.append(
                    dict(
                        claim_id=cid,
                        kind="recovered",
                        message="Synthetic appeal resolved with payment",
                        source="Synthetic Simulator",
                    )
                )
            if status in ["Denied", "Appealed"] and age > 30:
                assignments.append(
                    dict(
                        claim_id=cid,
                        user_id=rng.choice([1, 2, 3]),
                        recovery_status="Open",
                    )
                )
            if status == "Denied" and expected > 7000 and len(notifications) < 70:
                notifications.append(
                    dict(
                        claim_id=cid,
                        title=f"{cid}: high-value synthetic denial",
                        priority="High",
                        kind="high_value_denial",
                    )
                )
            if (
                deadline
                and 0 <= (deadline - today).days <= 7
                and len(notifications) < 100
            ):
                notifications.append(
                    dict(
                        claim_id=cid,
                        title=f"{cid}: appeal deadline in {(deadline-today).days} days",
                        priority="Critical",
                        kind="appeal_deadline",
                    )
                )
        for model, rows in [
            (Claim, claims),
            (ClaimLine, lines),
            (Denial, denials),
            (Payment, payments),
            (Appeal, appeals),
            (ClaimEvent, events),
            (Underpayment, underpayments),
            (Assignment, assignments),
            (Notification, notifications),
        ]:
            if model is ClaimEvent:
                for row in rows:
                    row.setdefault("created_at", utcnow())
            for start in range(0, len(rows), 2000):
                db.execute(model.__table__.insert(), rows[start : start + 2000])
        for table in [
            "users",
            "roles",
            "payers",
            "providers",
            "data_sources",
            "procedures",
            "diagnoses",
        ]:
            db.execute(
                text(
                    "SELECT setval(pg_get_serial_sequence('{table}', 'id'), (SELECT MAX(id) FROM {table}))".format(
                        table=table
                    )
                )
            )
        db.add(
            AuditLog(
                user_id=1,
                action="synthetic_seed",
                entity="claims",
                details={"count": count, "seed": seed_value},
            )
        )
        db.commit()
        return {
            "claims": count,
            "payments": len(payments),
            "denials": len(denials),
            "appeals": len(appeals),
            "seed": seed_value,
        }


if __name__ == "__main__":
    print(seed(settings.seed_count))
