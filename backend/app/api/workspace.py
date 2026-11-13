import csv, io, json, hmac, hashlib, time
from datetime import date, timedelta
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Request, Query
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from pydantic import BaseModel, Field
from sqlalchemy import select, func, desc
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.core.config import settings
from app.core.security import current_user, admin_user, rate_limit
from app.models.entities import *
from app.api.claims import serialize
from app.api.analytics import scope
from app.analytics.metrics import *
from app.ingestion.pipeline import ingest, parse_csv, error_csv, CSV_FIELDS
from app.ingestion.adapters import fhir_rows, cms_reference, nppes_reference
from app.schemas.claims import ClaimCreate, REASONS
from app.services.simulator import simulator
from app.websocket.hub import hub

router = APIRouter(tags=["Workspace"])


def csv_response(rows, filename):
    stream = io.StringIO()
    if rows:
        writer = csv.DictWriter(stream, fieldnames=list(rows[0]))
        writer.writeheader()
        for row in rows:
            # Prevent spreadsheet formula injection in string fields.
            writer.writerow(
                {
                    k: (
                        "'" + v
                        if isinstance(v, str)
                        and v[:1] in ["=", "+", "-", "@", "\t", "\r"]
                        else v
                    )
                    for k, v in row.items()
                }
            )
    return Response(
        stream.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/references", dependencies=[Depends(current_user)])
def references(db: Session = Depends(get_db)):
    return {
        "payers": [serialize(v) for v in db.scalars(select(Payer))],
        "providers": [serialize(v) for v in db.scalars(select(Provider))],
        "reasons": REASONS,
        "statuses": [
            "Draft",
            "Submitted",
            "Processing",
            "Paid",
            "Partially Paid",
            "Denied",
            "Appealed",
            "Recovered",
            "Closed",
        ],
    }


@router.get("/activity", dependencies=[Depends(current_user)])
def activity(limit: int = Query(30, ge=1, le=100), db: Session = Depends(get_db)):
    return [
        serialize(e)
        for e in db.scalars(
            select(ClaimEvent)
            .order_by(ClaimEvent.created_at.desc(), ClaimEvent.id.desc())
            .limit(limit)
        )
    ]


@router.get("/simulator", dependencies=[Depends(current_user)])
def simulator_status():
    return simulator.status()


class SimulatorControl(BaseModel):
    action: str = Field(pattern="^(start|pause|stop)$")
    interval: int = Field(default=3, ge=1, le=60)
    target: int = Field(default=20, ge=1, le=1000)


@router.post("/simulator", dependencies=[Depends(admin_user)])
async def simulator_control(data: SimulatorControl):
    return await simulator.control(data.action, data.interval, data.target)


@router.get("/data-sources", dependencies=[Depends(current_user)])
def sources(db: Session = Depends(get_db)):
    return [
        serialize(s) for s in db.scalars(select(DataSource).order_by(DataSource.id))
    ]


@router.post("/ingestion/csv", dependencies=[Depends(current_user)])
async def upload(
    file: UploadFile = File(...),
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    content = await file.read(10 * 1024 * 1024 + 1)
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "CSV file exceeds 10 MB limit.")
    rows = parse_csv(content)
    job = await run_in_threadpool(
        ingest, db, rows, 2, file.filename or "Uploaded CSV", user.id
    )
    db.commit()
    await hub.publish("claims_changed", {"source": "Uploaded CSV", "job_id": job.id})
    return serialize(job)


class Batch(BaseModel):
    records: list[dict] = Field(min_length=1, max_length=10000)


@router.post("/ingestion/rest", dependencies=[Depends(current_user)])
async def rest_ingest(
    data: Batch, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    job = await run_in_threadpool(
        ingest, db, data.records, 3, "REST API batch", user.id
    )
    db.commit()
    await hub.publish("claims_changed", {"source": "Connected API", "job_id": job.id})
    return serialize(job)


@router.post("/ingestion/webhook")
async def webhook(request: Request, db: Session = Depends(get_db)):
    if not settings.webhook_secret:
        raise HTTPException(
            503, "Webhook is disabled until WEBHOOK_SECRET is configured."
        )
    rate_limit("webhook:" + request.client.host, 60)
    timestamp = request.headers.get("x-cp-timestamp", "")
    try:
        if abs(time.time() - float(timestamp)) > 300:
            raise ValueError()
    except ValueError:
        raise HTTPException(401, "A current X-CP-Timestamp is required.")
    content = await request.body()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(413, "Webhook payload is too large.")
    expected = hmac.new(
        settings.webhook_secret.encode(),
        timestamp.encode() + b"." + content,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, request.headers.get("x-cp-signature", "")):
        raise HTTPException(401, "Invalid webhook signature.")
    try:
        batch = Batch.model_validate_json(content)
    except ValueError:
        raise HTTPException(422, "Invalid webhook JSON. Expected {records: [...]}")
    job = await run_in_threadpool(ingest, db, batch.records, 4, "Signed webhook")
    db.commit()
    await hub.publish(
        "claims_changed", {"source": "Webhook Integration", "job_id": job.id}
    )
    return serialize(job)


@router.post("/ingestion/fhir", dependencies=[Depends(admin_user)])
async def fhir_sync(db: Session = Depends(get_db), user: User = Depends(current_user)):
    try:
        rows = await fhir_rows()
    except HTTPException:
        raise
    except Exception as exc:
        import logging

        logging.exception("Authorised FHIR sync failed")
        source = db.get(DataSource, 5)
        source.status = "error"
        db.add(
            IngestionJob(
                source_id=5,
                filename="Authorised FHIR sync",
                status="failed",
                errors=[{"error": type(exc).__name__}],
            )
        )
        db.add(
            Notification(
                title="FHIR sync failed. Inspect integration configuration and logs.",
                priority="High",
                kind="ingestion_failure",
            )
        )
        db.commit()
        raise HTTPException(
            502, "FHIR request failed. Check the authorised endpoint and server logs."
        )
    job = await run_in_threadpool(
        ingest, db, rows, 5, "Authorized synthetic FHIR R4 sync", user.id
    )
    db.commit()
    await hub.publish("claims_changed", {"source": "FHIR R4", "job_id": job.id})
    return serialize(job)


@router.post("/reference-sync/{source}", dependencies=[Depends(admin_user)])
async def reference_sync(
    source: str, skip: int = Query(0, ge=0, le=1000), db: Session = Depends(get_db)
):
    if source not in ["cms", "nppes"]:
        raise HTTPException(404, "Unknown reference adapter.")
    try:
        result = (
            await cms_reference() if source == "cms" else await nppes_reference(skip)
        )
    except Exception as exc:
        import logging

        logging.exception("Public reference sync failed: %s", source)
        source_obj = db.get(DataSource, 6 if source == "cms" else 7)
        source_obj.status = "error"
        db.add(
            IngestionJob(
                source_id=source_obj.id,
                filename="Public reference sync",
                status="failed",
                total=0,
                valid=0,
                rejected=0,
                duplicates=0,
                missing=0,
                errors=[{"error": type(exc).__name__}],
            )
        )
        db.commit()
        raise HTTPException(
            502,
            "Reference API request failed. Source marked as error; inspect server logs and retry later.",
        )
    source_obj = db.get(DataSource, 6 if source == "cms" else 7)
    source_obj.status = "ready"
    source_obj.last_sync = utcnow()
    source_obj.details = result
    db.commit()
    return result


@router.get("/ingestion/template", dependencies=[Depends(current_user)])
def template():
    today = str(date.today())
    return csv_response(
        [
            {
                "id": "IMPORT-SAMPLE-001",
                "patient_id": "SYN-IMPORT-001",
                "provider_id": 1,
                "payer_id": 1,
                "submission_date": today,
                "service_date": today,
                "amount": 1250,
                "status": "Submitted",
                "synthetic": "true",
            }
        ],
        "claimpulse-template.csv",
    )


@router.get("/data-quality", dependencies=[Depends(current_user)])
def quality(db: Session = Depends(get_db)):
    jobs = list(
        db.scalars(select(IngestionJob).order_by(IngestionJob.id.desc()).limit(100))
    )
    totals = {
        key: int(
            db.scalar(select(func.coalesce(func.sum(getattr(IngestionJob, key)), 0)))
        )
        for key in ["total", "valid", "rejected", "duplicates", "missing"]
    }
    return {
        "totals": totals,
        "jobs": [serialize(j) for j in jobs],
        "stored_claims": db.scalar(select(func.count()).select_from(Claim)),
        "synthetic_only": True,
    }


@router.get("/ingestion/{job_id}/errors", dependencies=[Depends(current_user)])
def errors(job_id: int, db: Session = Depends(get_db)):
    job = db.get(IngestionJob, job_id)
    if not job:
        raise HTTPException(404, "Ingestion job not found.")
    return csv_response(job.errors, "ingestion-errors.csv")


@router.get("/exports/{kind}", dependencies=[Depends(current_user)])
def export(
    kind: str,
    q: str = "",
    status: str | None = None,
    min_amount: float | None = None,
    max_amount: float | None = None,
    filters=Depends(scope),
    db: Session = Depends(get_db),
):
    df = load_frame(db, **filters)
    if q:
        df = df[
            df.id.str.contains(q, case=False, regex=False)
            | df.patient_id.str.contains(q, case=False, regex=False)
        ]
    if status:
        df = df[df.status == status]
    if min_amount is not None:
        df = df[df.amount >= min_amount]
    if max_amount is not None:
        df = df[df.amount <= max_amount]
    if kind == "claims":
        rows = records(
            df,
            [
                "id",
                "patient_id",
                "payer",
                "provider",
                "submission_date",
                "service_date",
                "amount",
                "paid_amount",
                "adjustment",
                "outstanding",
                "status",
                "denial_reason",
                "days_outstanding",
                "appeal_deadline",
                "synthetic",
            ],
        )
    elif kind == "denials":
        rows = reason_breakdown(df)
    elif kind == "payers":
        rows = payer_breakdown(db, df)
    elif kind == "revenue-risk":
        rows = records(
            df[df.at_risk],
            [
                "id",
                "payer",
                "outstanding",
                "days_outstanding",
                "status",
                "appeal_deadline",
            ],
        )
    elif kind == "aging":
        rows = aging(df)
    elif kind == "recovery":
        rows = trend(df[df.recovered_paid > 0])
    elif kind == "underpayments":
        rows = records(
            df[df.underpayment > 0],
            [
                "id",
                "payer",
                "expected_reimbursement",
                "paid_amount",
                "underpayment",
                "expected_basis",
            ],
        )
    else:
        raise HTTPException(404, "Unknown report type.")
    return csv_response(rows, "claimpulse-" + kind + ".csv")


@router.get("/notifications", dependencies=[Depends(current_user)])
def notifications(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = []
    for n in db.scalars(
        select(Notification).order_by(Notification.created_at.desc()).limit(100)
    ):
        d = serialize(n)
        d["read"] = user.id in n.read_by
        rows.append(d)
    return rows


@router.post("/notifications/read", dependencies=[Depends(current_user)])
def read_notifications(
    user: User = Depends(current_user), db: Session = Depends(get_db)
):
    for n in db.scalars(select(Notification)):
        if user.id not in n.read_by:
            n.read_by = [*n.read_by, user.id]
    db.commit()
    return {"success": True}


@router.post("/notifications/refresh", dependencies=[Depends(current_user)])
def refresh_notifications(
    user: User = Depends(current_user), db: Session = Depends(get_db)
):
    from app.services.claims import reconcile_records

    thresholds = user.preferences.get("thresholds", {})
    df = load_frame(db, date.today() - timedelta(days=6), date.today())
    k = summarize(df)
    prev = summarize(
        load_frame(
            db, date.today() - timedelta(days=13), date.today() - timedelta(days=7)
        )
    )
    created = 0
    if (
        prev["adjudicated_claims"] >= 30
        and k["adjudicated_claims"] >= 30
        and k["denial_rate"] - prev["denial_rate"]
        >= thresholds.get("denial_increase", 5)
    ):
        db.add(
            Notification(
                title=f'Denial rate increased {k["denial_rate"]-prev["denial_rate"]:.1f} percentage points over the preceding 7-day cohort.',
                priority="High",
                kind="denial_rate_increase",
            )
        )
        created += 1
    for (payer, reason), group in df[df.was_denied].groupby(["payer", "denial_reason"]):
        if len(group) >= thresholds.get("pattern_count", 10):
            db.add(
                Notification(
                    title=f"Recurring pattern: {payer} / {reason} in {len(group)} synthetic claims this week.",
                    priority="Medium",
                    kind="payer_pattern",
                )
            )
            created += 1
    # Recompute current deadline, ageing and high-value alerts for persisted open claims.
    for c in db.scalars(
        select(Claim).where(
            Claim.status.in_(
                ["Denied", "Appealed", "Partially Paid", "Processing", "Submitted"]
            )
        )
    ):
        reconcile_records(db, c, c.paid_amount, user.id)
    db.commit()
    return {"success": True, "pattern_alerts": created}


class Preferences(BaseModel):
    high_value: int = Field(default=10000, ge=100, le=10000000)
    aging_days: int = Field(default=90, ge=1, le=365)
    deadline_days: int = Field(default=7, ge=1, le=90)
    denial_increase: int = Field(default=5, ge=1, le=100)
    pattern_count: int = Field(default=10, ge=2, le=10000)
    dark_mode: bool = False


@router.put("/settings", dependencies=[Depends(current_user)])
def settings_update(
    data: Preferences, user: User = Depends(current_user), db: Session = Depends(get_db)
):
    values = data.model_dump()
    dark = values.pop("dark_mode")
    user.preferences = {"thresholds": values, "dark_mode": dark}
    db.add(AuditLog(user_id=user.id, action="settings_updated", entity="preferences"))
    db.commit()
    return user.preferences


@router.get("/audit-logs", dependencies=[Depends(admin_user)])
def audits(db: Session = Depends(get_db)):
    return [
        serialize(a)
        for a in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(100))
    ]


@router.get("/system", dependencies=[Depends(current_user)])
def system():
    return {
        "demo_mode": settings.demo_mode,
        "fhir_configured": bool(settings.fhir_base_url),
        "webhook_configured": bool(settings.webhook_secret),
        "ai_provider": settings.ai_provider,
        "poll_seconds": settings.poll_seconds,
        "database": "PostgreSQL",
        "data_policy": "Synthetic records only",
        "version": "1.0.0",
    }


@router.get("/source", dependencies=[Depends(current_user)])
def source_archive():
    """Download a sanitized source snapshot; never package secrets, databases or runtime artifacts."""
    from pathlib import Path
    import zipfile

    root = Path(settings.source_root)
    excluded = {
        ".git",
        ".venv",
        "node_modules",
        ".next",
        "__pycache__",
        ".pytest_cache",
        "work",
        "artifacts",
        "test-results",
        "playwright-report",
    }
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in root.rglob("*"):
            relative = path.relative_to(root)
            if not path.is_file() or any(part in excluded for part in relative.parts):
                continue
            if path.name.startswith(".env") and path.name != ".env.example":
                continue
            if path.suffix in {".pyc", ".log", ".joblib", ".tsbuildinfo"}:
                continue
            archive.write(path, "claimpulse-ai/" + str(relative))
    return Response(
        stream.getvalue(),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="claimpulse-ai.zip"'},
    )
