from datetime import date
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, or_, asc, desc
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.security import current_user
from app.models.entities import *
from app.schemas.claims import (
    ClaimCreate,
    ClaimUpdate,
    NoteInput,
    WorkInput,
    TRANSITIONS,
)
from app.services.claims import create_claim, update_claim, event
from app.analytics.metrics import risk_components, historical_recovery
from app.websocket.hub import hub

router = APIRouter(
    prefix="/claims", tags=["Claims"], dependencies=[Depends(current_user)]
)


def serialize(model):
    return {c.name: getattr(model, c.name) for c in model.__table__.columns}


def summary(db, c):
    data = serialize(c)
    data["payer"] = db.get(Payer, c.payer_id).name
    pr = db.get(Provider, c.provider_id)
    data["provider"] = pr.name
    data["specialty"] = pr.specialty
    data["source"] = db.get(DataSource, c.source_id).name
    data["outstanding"] = max(Decimal(0), c.amount - c.paid_amount - c.adjustment)
    data["days_outstanding"] = (
        max(0, (date.today() - c.submission_date).days) if data["outstanding"] else 0
    )
    return data


@router.get("")
def list_claims(
    q: str = "",
    payer_id: int | None = None,
    status: str | None = None,
    start: date | None = None,
    end: date | None = None,
    min_amount: Decimal | None = None,
    max_amount: Decimal | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort: str = "submission_date",
    direction: str = "desc",
    db: Session = Depends(get_db),
):
    query = select(Claim)
    if q:
        query = query.where(
            or_(
                Claim.id.ilike("%" + q[:100] + "%"),
                Claim.patient_id.ilike("%" + q[:100] + "%"),
            )
        )
    if payer_id:
        query = query.where(Claim.payer_id == payer_id)
    if status:
        query = query.where(Claim.status == status)
    if start:
        query = query.where(Claim.submission_date >= start)
    if end:
        query = query.where(Claim.submission_date <= end)
    if min_amount is not None:
        query = query.where(Claim.amount >= min_amount)
    if max_amount is not None:
        query = query.where(Claim.amount <= max_amount)
    total = db.scalar(select(func.count()).select_from(query.subquery()))
    columns = {
        "id": Claim.id,
        "amount": Claim.amount,
        "status": Claim.status,
        "submission_date": Claim.submission_date,
        "paid_amount": Claim.paid_amount,
        "outstanding": Claim.amount - Claim.paid_amount - Claim.adjustment,
    }
    column = columns.get(sort, Claim.submission_date)
    query = (
        query.order_by(desc(column) if direction == "desc" else asc(column), Claim.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    return {
        "items": [summary(db, c) for c in db.scalars(query)],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("", status_code=201)
async def create(
    data: ClaimCreate, db: Session = Depends(get_db), user: User = Depends(current_user)
):
    c = create_claim(db, data, 3, user.id)
    db.commit()
    await hub.publish("claims_changed", {"claim_id": c.id, "action": "created"})
    return summary(db, c)


@router.get("/{cid}")
def detail(cid: str, db: Session = Depends(get_db)):
    c = db.get(Claim, cid)
    if not c:
        raise HTTPException(404, "Claim not found.")
    data = summary(db, c)
    rate = historical_recovery(db).get(c.payer_id, 0.5)
    failed = db.scalar(
        select(Appeal.id).where(
            Appeal.claim_id == cid, Appeal.outcome == "Unsuccessful"
        )
    )
    data["risk"] = risk_components(data, rate * (0.5 if failed else 1))
    data["transitions"] = TRANSITIONS[c.status]
    for name, model in [
        ("notes", ClaimNote),
        ("events", ClaimEvent),
        ("payments", Payment),
        ("appeals", Appeal),
        ("actions", RecoveryAction),
        ("lines", ClaimLine),
    ]:
        data[name] = [
            serialize(v)
            for v in db.scalars(
                select(model).where(model.claim_id == cid).order_by(model.id.desc())
            )
        ]
    assignment = db.scalar(select(Assignment).where(Assignment.claim_id == cid))
    data["assignment"] = serialize(assignment) if assignment else None
    return data


@router.patch("/{cid}")
async def update(
    cid: str,
    data: ClaimUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    c = update_claim(db, cid, data, user.id)
    db.commit()
    await hub.publish("claims_changed", {"claim_id": cid, "action": "updated"})
    return summary(db, c)


@router.post("/{cid}/notes", status_code=201)
async def note(
    cid: str,
    data: NoteInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    c = db.get(Claim, cid)
    if not c:
        raise HTTPException(404, "Claim not found.")
    n = ClaimNote(claim_id=cid, user_id=user.id, text=data.text.strip())
    db.add(n)
    event(db, c, "note_added", "A team note was added", user_id=user.id)
    db.commit()
    await hub.publish("claims_changed", {"claim_id": cid, "action": "note_added"})
    return serialize(n)


@router.put("/{cid}/assignment")
async def assign(
    cid: str,
    data: WorkInput,
    db: Session = Depends(get_db),
    user: User = Depends(current_user),
):
    c = db.get(Claim, cid)
    if not c:
        raise HTTPException(404, "Claim not found.")
    if data.user_id is not None and not db.get(User, data.user_id):
        raise HTTPException(422, "Unknown team member.")
    a = db.scalar(select(Assignment).where(Assignment.claim_id == cid))
    if not a:
        a = Assignment(claim_id=cid)
        db.add(a)
    a.user_id = data.user_id
    a.priority = data.priority
    a.recovery_status = data.recovery_status
    if data.action:
        db.add(RecoveryAction(claim_id=cid, user_id=user.id, action=data.action))
    event(
        db,
        c,
        "worklist_updated",
        "Assignment, priority or recovery follow-up updated",
        user_id=user.id,
        details={
            "priority": data.priority,
            "assignee": data.user_id,
            "recovery_status": data.recovery_status,
        },
    )
    db.commit()
    await hub.publish("claims_changed", {"claim_id": cid, "action": "assigned"})
    return serialize(a)
