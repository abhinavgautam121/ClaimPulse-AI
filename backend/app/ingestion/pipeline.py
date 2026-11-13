import csv, io
from datetime import datetime, timezone
from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from app.schemas.claims import ClaimCreate
from app.models.entities import IngestionJob, DataSource, Claim, Notification
from app.services.claims import create_claim

CSV_FIELDS = list(ClaimCreate.model_fields)


def ingest(db, rows, source_id, filename, user_id=None):
    if len(rows) > 10000:
        raise HTTPException(413, "Maximum 10,000 records per ingestion job.")
    job = IngestionJob(
        source_id=source_id,
        filename=filename[:200],
        status="processing",
        total=len(rows),
        valid=0,
        rejected=0,
        duplicates=0,
        missing=0,
        errors=[],
    )
    db.add(job)
    db.flush()
    errors = []
    seen = set()
    for number, raw in enumerate(rows, 2):
        cid = str(raw.get("id", "")).strip()
        if cid and (cid in seen or db.get(Claim, cid)):
            job.duplicates += 1
            errors.append(
                {
                    "row": number,
                    "claim_id": cid,
                    "type": "duplicate",
                    "error": "Claim ID already exists; no existing data overwritten.",
                }
            )
            continue
        seen.add(cid)
        try:
            unknown = set(raw) - set(CSV_FIELDS)
            if unknown:
                raise ValueError(
                    "Unsupported columns: "
                    + ", ".join(sorted(unknown))
                    + ". Use synthetic reference IDs only."
                )
            clean = {k: v for k, v in raw.items() if v is not None and v != ""}
            if not cid:
                job.missing += 1
            with db.begin_nested():
                create_claim(db, ClaimCreate(**clean), source_id, user_id)
            job.valid += 1
        except (ValidationError, ValueError, HTTPException, IntegrityError) as exc:
            job.rejected += 1
            msg = exc.detail if isinstance(exc, HTTPException) else str(exc)
            if isinstance(exc, ValidationError):
                msg = "; ".join(
                    ".".join(map(str, e["loc"])) + ": " + e["msg"] for e in exc.errors()
                )
                if any(e["type"] == "missing" for e in exc.errors()) and cid:
                    job.missing += 1
            # Do not persist raw payloads or unrecognized column values.
            errors.append(
                {
                    "row": number,
                    "claim_id": cid[:50],
                    "type": "validation",
                    "error": msg[:600],
                }
            )
    job.errors = errors
    job.status = "completed" if not job.rejected else "completed_with_errors"
    source = db.get(DataSource, source_id)
    if job.valid:
        source.last_sync = datetime.now(timezone.utc)
    source.status = "ready" if not job.rejected else "attention"
    if job.rejected:
        db.add(
            Notification(
                title=f"{filename[:80]}: {job.rejected} records rejected",
                priority="High",
                kind="ingestion_failure",
            )
        )
    db.flush()
    return job


def parse_csv(content: bytes):
    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames or "id" not in reader.fieldnames:
            raise ValueError("CSV header must include id.")
        if len(reader.fieldnames) != len(set(reader.fieldnames)):
            raise ValueError("Duplicate CSV column names are not allowed.")
        rows = list(reader)
        if any(None in r for r in rows):
            raise ValueError("Row has more fields than the header.")
        return rows
    except (UnicodeDecodeError, csv.Error, ValueError) as exc:
        raise HTTPException(422, f"Invalid UTF-8 CSV: {exc}")


def error_csv(job):
    stream = io.StringIO()
    writer = csv.DictWriter(stream, fieldnames=["row", "claim_id", "type", "error"])
    writer.writeheader()
    writer.writerows(job.errors)
    return stream.getvalue()
