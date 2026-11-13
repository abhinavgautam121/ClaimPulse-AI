"""All financial calculations operate on persisted records, scoped by submission cohort."""

from datetime import date, timedelta
import pandas as pd
import numpy as np
from sqlalchemy import select, func
from app.models.entities import (
    Claim,
    Payer,
    Provider,
    Denial,
    Appeal,
    Payment,
    Assignment,
    User,
)

ADJUDICATED = ["Paid", "Partially Paid", "Denied", "Appealed", "Recovered", "Closed"]
BUCKETS = ["0–30", "31–60", "61–90", "91–120", "120+"]
METRIC_DEFINITIONS = {
    "denial_rate": "Claims with a historical denial / claims with adjudicated outcomes in the submission cohort × 100. Recovered claims retain denial history. Drafts are excluded.",
    "outstanding": "Drafts excluded. Billed charges − recorded payments − applicable contractual adjustments; includes any patient balance. Never equated with collectible revenue.",
    "revenue_at_risk": "Outstanding balances on denied/appealed claims or claims aged over 90 days. A review exposure, not an expected loss.",
    "recovery_rate": "Ledger payments marked recovered / original denied allowed amount in the submission cohort × 100.",
    "avg_days_ar": "Unweighted mean calendar days since submission among claims with a positive net outstanding balance.",
    "underpayment": "Expected insurer reimbursement − actual payment on adjudicated Partially Paid/Paid records, floored at zero. Expected values use a labelled synthetic 72% contract assumption.",
    "appeal_success_rate": "Successful appeals / resolved appeals. Pending appeals excluded.",
    "period": "Inclusive start and end dates, by claim submission date. Daily event feeds use event timestamps; all financial cohort charts use submission date.",
}


def load_frame(
    db,
    start=None,
    end=None,
    payer_id=None,
    provider_id=None,
    specialty=None,
    category=None,
):
    q = (
        select(
            Claim,
            Payer.name.label("payer"),
            Provider.name.label("provider"),
            Provider.specialty,
            Denial.id.label("denial_id"),
        )
        .join(Payer, Claim.payer_id == Payer.id)
        .join(Provider, Claim.provider_id == Provider.id)
        .outerjoin(Denial, Denial.claim_id == Claim.id)
    )
    if start:
        q = q.where(Claim.submission_date >= start)
    if end:
        q = q.where(Claim.submission_date <= end)
    if payer_id:
        q = q.where(Claim.payer_id == payer_id)
    if provider_id:
        q = q.where(Claim.provider_id == provider_id)
    if specialty:
        q = q.where(Provider.specialty == specialty)
    if category:
        q = q.where(Claim.procedure_category == category)
    rows = []
    for c, payer, provider, spec, did in db.execute(q):
        d = {col.name: getattr(c, col.name) for col in Claim.__table__.columns}
        for k in [
            "amount",
            "paid_amount",
            "adjustment",
            "expected_reimbursement",
            "patient_responsibility",
        ]:
            d[k] = float(d[k])
        d.update(payer=payer, provider=provider, specialty=spec, was_denied=bool(did))
        rows.append(d)
    cols = [c.name for c in Claim.__table__.columns] + [
        "payer",
        "provider",
        "specialty",
        "was_denied",
    ]
    df = pd.DataFrame(rows, columns=cols)
    recovered_map = dict(
        db.execute(
            select(Payment.claim_id, func.sum(Payment.amount))
            .where(Payment.recovered == True)
            .group_by(Payment.claim_id)
        ).all()
    )
    df["recovered_paid"] = df.id.map(
        lambda cid: float(recovered_map.get(cid, 0))
    ).astype(float)
    df["outstanding"] = (
        (df.amount - df.paid_amount - df.adjustment)
        .astype(float)
        .clip(lower=0)
        .round(2)
    )
    df.loc[df.status == "Draft", "outstanding"] = 0.0
    df["days_outstanding"] = (
        df.apply(
            lambda r: (
                max(0, (date.today() - r.submission_date).days)
                if r.outstanding > 0
                else 0
            ),
            axis=1,
        )
        if len(df)
        else pd.Series(dtype=int)
    )
    df["adjudicated"] = df.status.isin(ADJUDICATED)
    df["at_risk"] = (df.outstanding > 0) & (
        (df.days_outstanding > 90) | df.status.isin(["Denied", "Appealed"])
    )
    df["underpayment"] = np.where(
        df.status.isin(["Paid", "Partially Paid"]) & (df.paid_amount > 0),
        (df.expected_reimbursement - df.paid_amount).clip(lower=0),
        0,
    ).astype(float)
    return df


def safe_ratio(a, b):
    return round(float(a) / float(b) * 100, 2) if b else 0.0


def summarize(df):
    outstanding = df[df.outstanding > 0]
    adjudicated = int(df.adjudicated.sum())
    denied = int((df.was_denied & df.adjudicated).sum())
    eligible = df[df.was_denied].expected_reimbursement.sum()
    recovered = (
        df.recovered_paid.sum()
        if "recovered_paid" in df
        else df[df.status == "Recovered"].paid_amount.sum()
    )
    return dict(
        total_claims=int((df.status != "Draft").sum()),
        denied_claims=denied,
        adjudicated_claims=adjudicated,
        denial_rate=safe_ratio(denied, adjudicated),
        billed=round(float(df[df.status != "Draft"].amount.sum()), 2),
        outstanding=round(float(outstanding.outstanding.sum()), 2),
        revenue_at_risk=round(float(df[df.at_risk].outstanding.sum()), 2),
        paid=round(float(df.paid_amount.sum()), 2),
        recovered=round(float(recovered), 2),
        recovery_rate=safe_ratio(recovered, eligible),
        avg_days_ar=(
            round(float(outstanding.days_outstanding.mean()), 1)
            if len(outstanding)
            else 0
        ),
        underpayment=round(float(df.underpayment.sum()), 2),
    )


def records(df, columns=None):
    if columns:
        df = df[columns]
    return df.replace({np.nan: None}).to_dict("records")


def reason_breakdown(df):
    d = df[df.was_denied]
    if d.empty:
        return []
    rows = (
        d.groupby("denial_reason", dropna=False)
        .agg(count=("id", "count"), amount=("expected_reimbursement", "sum"))
        .sort_values("amount", ascending=False)
        .reset_index()
        .rename(columns={"denial_reason": "reason"})
    )
    rows["share"] = rows.amount / rows.amount.sum() * 100
    rows["cumulative"] = rows.share.cumsum()
    return records(rows.round(2))


def payer_breakdown(db, df):
    rows = []
    appeal_map = {}
    for cid, outcome in db.execute(select(Appeal.claim_id, Appeal.outcome)):
        appeal_map[cid] = outcome
    pay_days = {
        cid: (pd - sub).days
        for cid, pd, sub in db.execute(
            select(
                Payment.claim_id, func.max(Payment.payment_date), Claim.submission_date
            )
            .join(Claim, Payment.claim_id == Claim.id)
            .group_by(Payment.claim_id, Claim.submission_date)
        )
    }
    for pid, group in df.groupby("payer_id"):
        k = summarize(group)
        resolved = [
            appeal_map[c]
            for c in group.id
            if appeal_map.get(c) in ["Successful", "Unsuccessful"]
        ]
        days = [pay_days[c] for c in group.id if c in pay_days]
        k.update(
            payer_id=int(pid),
            payer=group.payer.iloc[0],
            avg_reimbursement_days=round(float(np.mean(days)), 1) if days else None,
            avg_claim=round(float(group.amount.mean()), 2),
            avg_paid=round(float(group.paid_amount.mean()), 2),
            appeal_success_rate=safe_ratio(resolved.count("Successful"), len(resolved)),
            resolved_appeals=len(resolved),
            sufficient_data=k["adjudicated_claims"] >= 30,
        )
        # Transparent score: outcome cleanliness 60%, payment timeliness 40%; withheld for n<30.
        k["score"] = (
            round(
                0.6 * (100 - k["denial_rate"])
                + 0.4 * max(0, 100 - (k["avg_reimbursement_days"] or 100)),
                1,
            )
            if k["sufficient_data"]
            else None
        )
        rows.append(k)
    return sorted(rows, key=lambda x: x["outstanding"], reverse=True)


def trend(df):
    if df.empty:
        return []
    df = df.copy()
    df["period"] = (
        pd.to_datetime(df.submission_date)
        .dt.to_period("W")
        .dt.start_time.dt.strftime("%Y-%m-%d")
    )
    rows = []
    for period, g in df.groupby("period"):
        k = summarize(g)
        k.update(period=period, label=pd.Timestamp(period).strftime("%b %d"))
        rows.append(k)
    return rows


def aging(df):
    rows = []
    for label, lo, hi in zip(BUCKETS, [0, 31, 61, 91, 121], [30, 60, 90, 120, 100000]):
        d = df[
            (df.outstanding > 0)
            & (df.days_outstanding >= lo)
            & (df.days_outstanding <= hi)
        ]
        rows.append(
            dict(
                bucket=label, amount=round(float(d.outstanding.sum()), 2), count=len(d)
            )
        )
    return rows


def risk_components(row, recovery_rate=0.5):
    get = lambda k, default=0: row.get(k, default)
    amount = float(get("outstanding"))
    days = int(get("days_outstanding"))
    status = get("status", "")
    deadline = get("appeal_deadline", None)
    remaining = (
        (deadline - date.today()).days if deadline and not pd.isna(deadline) else None
    )
    components = {
        "Amount exposure": round(min(25, amount / 10000 * 25), 1),
        "Outstanding age": round(min(25, days / 120 * 25), 1),
        "Denial status": 20 if status in ["Denied", "Appealed"] else 0,
        "Appeal deadline": (
            20
            if remaining is not None and remaining <= 7
            else 12 if remaining is not None and remaining <= 30 else 0
        ),
        "Historical recovery": round(10 * (1 - recovery_rate), 1),
    }
    score = round(sum(components.values()), 1)
    level = (
        "Critical"
        if score >= 75
        else "High" if score >= 55 else "Medium" if score >= 30 else "Low"
    )
    reason = get("denial_reason")
    action = {
        "Missing documentation": "Review and attach supporting documentation.",
        "Prior authorisation": "Verify prior authorisation records.",
        "Incorrect coding": "Request a certified coding review.",
        "Eligibility issues": "Verify coverage for the service date.",
    }.get(reason, "Review payer response and confirm the next follow-up action.")
    if remaining is not None and remaining < 0:
        action = (
            "Appeal deadline has passed. Review payer exceptions and escalation options. "
            + action
        )
    elif remaining is not None and remaining <= 7:
        action = f"Appeal due in {remaining} days. " + action
    return dict(
        score=score,
        priority=level,
        components=components,
        deadline_days=remaining,
        recovery_likelihood=round(recovery_rate * 100, 1),
        recommendation=action,
    )


def historical_recovery(db):
    totals = dict(
        db.execute(
            select(Claim.payer_id, func.count(Denial.id))
            .join(Denial, Denial.claim_id == Claim.id)
            .group_by(Claim.payer_id)
        ).all()
    )
    recovered = dict(
        db.execute(
            select(Claim.payer_id, func.count(func.distinct(Payment.claim_id)))
            .join(Payment, Payment.claim_id == Claim.id)
            .where(Payment.recovered == True)
            .group_by(Claim.payer_id)
        ).all()
    )
    return {
        pid: (recovered.get(pid, 0) + 1) / (count + 2) for pid, count in totals.items()
    }


def worklist(db, df, limit=100):
    assignments = {a.claim_id: a for a in db.scalars(select(Assignment))}
    users = {u.id: u.name for u in db.scalars(select(User))}
    # Historical appeal success by payer, with Laplace smoothing; descriptive, not a calibrated probability.
    rates = historical_recovery(db)
    failed = {
        cid
        for (cid,) in db.execute(
            select(Appeal.claim_id).where(Appeal.outcome == "Unsuccessful")
        )
    }
    rows = []
    for row in records(df[df.outstanding > 0]):
        rate = rates.get(row["payer_id"], 0.5) * (0.5 if row["id"] in failed else 1)
        r = risk_components(row, rate)
        row.update(r)
        row["previous_unsuccessful_appeal"] = row["id"] in failed
        a = assignments.get(row["id"])
        row.update(
            assigned_to=users.get(a.user_id) if a else None,
            assigned_user_id=a.user_id if a else None,
            recovery_status=a.recovery_status if a else "Open",
        )
        if a and a.priority:
            row["priority"] = a.priority
            row["priority_override"] = True
        rows.append(row)
    order = {"Critical": 0, "High": 1, "Medium": 2, "Low": 3}
    rows.sort(key=lambda r: (order[r["priority"]], -r["score"], -r["outstanding"]))
    return rows[:limit]


def executive(db, df, start, end, filters=None):
    k = summarize(df)
    days = (end - start).days + 1
    prev = load_frame(
        db, start - timedelta(days=days), start - timedelta(days=1), **(filters or {})
    )
    prior = summarize(prev)
    changes = {
        key: round((val - prior[key]) / prior[key] * 100, 1) if prior.get(key) else None
        for key, val in k.items()
        if isinstance(val, (int, float))
    }
    reasons = reason_breakdown(df)
    by_provider = (
        records(
            df.groupby(["provider", "specialty"])
            .agg(
                claims=("id", "count"),
                denied=("was_denied", "sum"),
                amount=("expected_reimbursement", "sum"),
                outstanding=("outstanding", "sum"),
            )
            .reset_index()
        )
        if len(df)
        else []
    )
    return dict(
        kpis=k,
        previous=prior,
        changes=changes,
        trend=trend(df),
        aging=aging(df),
        reasons=reasons,
        payers=payer_breakdown(db, df),
        providers=by_provider,
        priority=worklist(db, df, 5),
        period={"start": start, "end": end, "basis": "submission date"},
        definitions=METRIC_DEFINITIONS,
        record_count=len(df),
    )
