from datetime import date, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from app.core.database import get_db
from app.core.security import current_user, admin_user
from app.analytics.metrics import *
from app.ml import engine as ml
from app.services.copilot import answer

router = APIRouter(tags=["Analytics"], dependencies=[Depends(current_user)])


def scope(
    start: date | None = None,
    end: date | None = None,
    payer_id: int | None = None,
    provider_id: int | None = None,
    specialty: str | None = None,
    category: str | None = None,
):
    end = end or date.today()
    start = start or end - timedelta(days=89)
    if start > end:
        raise HTTPException(422, "Start date must be on or before end date.")
    if (end - start).days > 3660:
        raise HTTPException(422, "Maximum reporting window is 10 years.")
    return {
        "start": start,
        "end": end,
        "payer_id": payer_id,
        "provider_id": provider_id,
        "specialty": specialty,
        "category": category,
    }


@router.get("/analytics/dashboard")
def dashboard(filters=Depends(scope), db: Session = Depends(get_db)):
    return executive(
        db,
        load_frame(db, **filters),
        filters["start"],
        filters["end"],
        {k: v for k, v in filters.items() if k not in ["start", "end"]},
    )


@router.get("/analytics/denials")
def denials(filters=Depends(scope), db: Session = Depends(get_db)):
    df = load_frame(db, **filters)
    d = df[df.was_denied]
    providers = []
    specialties = []
    for name in ["provider", "specialty"]:
        out = []
        for label, g in df.groupby(name):
            k = summarize(g)
            out.append(
                {
                    "name": label,
                    "claims": k["total_claims"],
                    "denied": k["denied_claims"],
                    "denial_rate": k["denial_rate"],
                    "denied_amount": round(
                        float(g[g.was_denied].expected_reimbursement.sum()), 2
                    ),
                }
            )
        (providers if name == "provider" else specialties).extend(out)
    reasons = reason_breakdown(df)
    insight = (
        f'{reasons[0]["reason"]} accounts for {reasons[0]["share"]:.1f}% of denied expected reimbursement in the selected period.'
        if reasons
        else "No historical denials in the selected period."
    )
    return {
        "kpis": summarize(df),
        "reasons": reasons,
        "trend": trend(df),
        "payers": payer_breakdown(db, df),
        "providers": providers,
        "specialties": specialties,
        "insight": insight,
        "period": filters,
    }


@router.get("/analytics/revenue-risk")
def risk(filters=Depends(scope), db: Session = Depends(get_db)):
    df = load_frame(db, **filters)
    return {
        "kpis": summarize(df),
        "aging": aging(df),
        "payers": payer_breakdown(db, df),
        "claims": worklist(db, df, 100),
        "trend": trend(df),
        "period": filters,
    }


@router.get("/analytics/worklist")
def priorities(
    filters=Depends(scope),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
):
    df = load_frame(db, **filters)
    return {
        "items": worklist(db, df, limit),
        "total": int((df.outstanding > 0).sum()),
        "period": filters,
        "method": "Amount 25 + age 25 + denial 20 + deadline 20 + historical recovery 10. Manual priority overrides are retained.",
    }


@router.get("/analytics/payers")
def payers(filters=Depends(scope), db: Session = Depends(get_db)):
    return {
        "items": payer_breakdown(db, load_frame(db, **filters)),
        "period": filters,
        "score_definition": "60% × (100 − denial rate) + 40% × max(0,100 − mean reimbursement days). Withheld below 30 adjudicated claims.",
    }


@router.get("/analytics/underpayments")
def underpayments(filters=Depends(scope), db: Session = Depends(get_db)):
    df = load_frame(db, **filters)
    d = df[df.underpayment > 0].sort_values("underpayment", ascending=False)
    by = lambda key: (
        records(
            d.groupby(key)
            .agg(amount=("underpayment", "sum"), count=("id", "count"))
            .reset_index()
            .round(2)
        )
        if len(d)
        else []
    )
    return {
        "amount": round(float(d.underpayment.sum()), 2),
        "count": len(d),
        "items": records(d.head(100)),
        "payers": by("payer"),
        "providers": by("provider"),
        "trend": trend(d),
        "period": filters,
        "basis": "Synthetic insurer contract assumption: expected reimbursement = 72% of billed charges. An alert requires a recorded payment and an adjudicated outcome; submitted and denied claims are excluded.",
    }


@router.get("/ml/status")
def model_status():
    return ml.status()


@router.post("/ml/train", dependencies=[Depends(admin_user)])
def train_model(db: Session = Depends(get_db)):
    return ml.train(db)


@router.post("/ml/predict/{cid}")
def predict_model(cid: str, db: Session = Depends(get_db)):
    return ml.predict(db, cid)


class Question(BaseModel):
    question: str = Field(min_length=3, max_length=1000)
    start: date | None = None
    end: date | None = None


@router.post("/copilot")
async def copilot(data: Question, db: Session = Depends(get_db)):
    filters = scope(data.start, data.end)
    return await answer(db, data.question, filters["start"], filters["end"])
