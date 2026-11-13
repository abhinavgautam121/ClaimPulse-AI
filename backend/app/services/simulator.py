import asyncio, random, uuid
from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import select
from app.core.database import SessionLocal
from app.core.config import settings
from app.models.entities import Claim, DataSource, IngestionJob, Notification
from app.schemas.claims import ClaimCreate, ClaimUpdate
from app.services.claims import create_claim, update_claim
from app.ingestion.pipeline import ingest
from app.ingestion.adapters import fhir_rows
from app.websocket.hub import hub


class Simulator:
    def __init__(self):
        self.state = "stopped"
        self.interval = 3
        self.target = 20
        self.generated = 0
        self.events = 0
        self.ids = []
        self.rng = random.Random(72)
        self.task = None

    def status(self):
        return {
            "state": self.state,
            "interval": self.interval,
            "target": self.target,
            "generated": self.generated,
            "events": self.events,
            "source": "Synthetic Simulator",
        }

    async def run(self):
        while True:
            await asyncio.sleep(self.interval)
            if self.state != "running":
                continue
            try:
                result = await asyncio.to_thread(self.tick)
                await hub.publish("claims_changed", result)
                if self.generated >= self.target and not self.ids:
                    self.state = "stopped"
            except Exception:
                import logging

                logging.exception("Synthetic simulation failed")
                self.state = "paused"
                await hub.publish(
                    "simulator_error",
                    {"message": "Simulator paused after an error; check backend logs."},
                )

    def tick(self):
        with SessionLocal() as db:
            live = [db.get(Claim, cid) for cid in self.ids]
            live = [
                c
                for c in live
                if c and c.status in ["Submitted", "Processing", "Denied", "Appealed"]
            ]
            self.ids = [c.id for c in live]
            if self.generated < self.target and (not live or self.rng.random() < 0.45):
                cid = "SIM-" + uuid.uuid4().hex[:12].upper()
                amount = Decimal(str(self.rng.randint(200, 14000)))
                c = create_claim(
                    db,
                    ClaimCreate(
                        id=cid,
                        patient_id="SYN-SIM-" + uuid.uuid4().hex[:8],
                        provider_id=self.rng.randint(1, 10),
                        payer_id=self.rng.randint(1, 8),
                        submission_date=date.today(),
                        service_date=date.today() - timedelta(days=3),
                        amount=amount,
                        adjustment=(amount * Decimal(".28")).quantize(Decimal(".01")),
                        documentation_complete=self.rng.random() > 0.25,
                    ),
                    1,
                    1,
                )
                self.generated += 1
                self.ids.append(cid)
            elif live:
                c = self.rng.choice(live)
                if c.status == "Submitted":
                    change = {"status": "Processing"}
                elif c.status == "Processing":
                    if self.rng.random() < 0.3:
                        change = {
                            "status": "Denied",
                            "denial_reason": "Missing documentation",
                            "appeal_deadline": date.today() + timedelta(days=7),
                        }
                    else:
                        change = {
                            "status": "Paid",
                            "paid_amount": c.amount - c.adjustment,
                        }
                elif c.status == "Denied":
                    change = {"status": "Appealed"}
                else:
                    change = {
                        "status": "Recovered",
                        "paid_amount": c.amount - c.adjustment,
                    }
                update_claim(db, c.id, ClaimUpdate(**change), 1)
            else:
                return {
                    "source": "Synthetic Simulator",
                    "message": "Simulation completed.",
                }
            db.commit()
            self.events += 1
            return {
                "claim_id": c.id,
                "status": c.status,
                "source": "Synthetic Simulator",
                "simulator": self.status(),
            }

    async def control(self, action, interval=None, target=None):
        if interval is not None:
            self.interval = interval
        if target is not None:
            self.target = target
        if action == "start":
            if self.state == "stopped":
                self.generated = 0
                self.events = 0
                self.ids = []
            self.state = "running"
        elif action == "pause":
            self.state = "paused"
        elif action == "stop":
            self.state = "stopped"
        if self.task is None:
            self.task = asyncio.create_task(self.run())
        await hub.publish("simulator_changed", self.status())
        return self.status()


simulator = Simulator()


async def polling_worker():
    while True:
        await asyncio.sleep(max(30, settings.poll_seconds))
        if not settings.fhir_base_url:
            continue
        try:
            rows = await fhir_rows()
            with SessionLocal() as db:
                ingest(db, rows, 5, "Scheduled FHIR R4 poll", 1)
                db.commit()
            await hub.publish(
                "claims_changed", {"source": "FHIR R4", "records": len(rows)}
            )
        except Exception as exc:
            import logging

            logging.exception("Scheduled FHIR polling failed")
            with SessionLocal() as db:
                source = db.get(DataSource, 5)
                source.status = "error"
                db.add(
                    IngestionJob(
                        source_id=5,
                        filename="Scheduled FHIR R4 poll",
                        status="failed",
                        total=0,
                        valid=0,
                        rejected=0,
                        duplicates=0,
                        missing=0,
                        errors=[{"error": type(exc).__name__}],
                    )
                )
                db.add(
                    Notification(
                        title="Scheduled FHIR polling failed; inspect ingestion logs.",
                        priority="High",
                        kind="ingestion_failure",
                    )
                )
                db.commit()
            await hub.publish("ingestion_failed", {"source": "FHIR R4"})
