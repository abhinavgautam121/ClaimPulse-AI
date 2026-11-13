from datetime import date, timedelta
from decimal import Decimal
import io, json, hmac, hashlib, time
import pandas as pd
from sqlalchemy import select, func, text
from app.models.entities import *
from app.analytics.metrics import summarize, aging, risk_components, load_frame
from app.core.config import settings
from app.services.simulator import Simulator


def payload(id="TEST-CLAIM-001"):
    return dict(
        id=id,
        patient_id="SYN-TEST-001",
        provider_id=1,
        payer_id=1,
        submission_date=str(date.today()),
        service_date=str(date.today()),
        amount="1000.00",
        adjustment="280.00",
        status="Submitted",
    )


def test_protected_and_authentication(client):
    assert client.get("/api/claims").status_code == 401
    r = client.post(
        "/api/auth/register",
        json={
            "name": "Test Analyst",
            "email": "analyst@example.org",
            "password": "Test-only-Password-429!",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["role"] == "analyst"
    assert client.get("/api/auth/me").status_code == 200
    assert client.post("/api/ml/train").status_code == 403
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "analyst@example.org", "password": "incorrect"},
        ).status_code
        == 401
    )
    assert (
        client.post(
            "/api/auth/login",
            json={
                "email": "analyst@example.org",
                "password": "Test-only-Password-429!",
            },
        ).status_code
        == 200
    )


def test_create_filter_update_and_payments(logged, db):
    c = logged.post("/api/claims", json=payload())
    assert c.status_code == 201, c.text
    assert Decimal(c.json()["outstanding"]) == Decimal("720")
    assert logged.post("/api/claims", json=payload()).status_code == 409
    assert (
        logged.patch(
            "/api/claims/TEST-CLAIM-001", json={"status": "Recovered"}
        ).status_code
        == 422
    )
    r = logged.patch("/api/claims/TEST-CLAIM-001", json={"status": "Processing"})
    assert r.status_code == 200
    r = logged.patch(
        "/api/claims/TEST-CLAIM-001", json={"status": "Paid", "paid_amount": "720.00"}
    )
    assert r.status_code == 200, r.text
    assert float(r.json()["outstanding"]) == 0
    assert (
        float(
            db.scalar(
                select(func.sum(Payment.amount)).where(
                    Payment.claim_id == "TEST-CLAIM-001"
                )
            )
        )
        == 720
    )
    assert logged.get("/api/claims?q=TEST-CLAIM-001&status=Paid").json()["total"] == 1
    assert (
        logged.patch(
            "/api/claims/TEST-CLAIM-001", json={"paid_amount": "700"}
        ).status_code
        == 422
    )


def test_input_validation(logged):
    for change in [
        {"amount": "-1"},
        {"patient_id": "REAL-PATIENT"},
        {"service_date": str(date.today() + timedelta(days=1))},
        {"paid_amount": "1001"},
        {"status": "Denied"},
        {"synthetic": False},
    ]:
        data = payload()
        data.update(change)
        assert logged.post("/api/claims", json=data).status_code == 422


def test_denial_appeal_recovery_and_history(logged, db):
    data = payload("TEST-APPEAL-001")
    data.update(
        status="Denied",
        denial_reason="Missing documentation",
        appeal_deadline=str(date.today() + timedelta(days=5)),
    )
    assert logged.post("/api/claims", json=data).status_code == 201
    assert (
        logged.patch(
            "/api/claims/TEST-APPEAL-001", json={"status": "Appealed"}
        ).status_code
        == 200
    )
    assert (
        logged.patch(
            "/api/claims/TEST-APPEAL-001",
            json={"status": "Recovered", "paid_amount": "720.00"},
        ).status_code
        == 200
    )
    details = logged.get("/api/claims/TEST-APPEAL-001").json()
    assert details["appeals"][0]["outcome"] == "Successful"
    assert details["payments"][0]["recovered"] is True
    assert db.scalar(select(Denial.id).where(Denial.claim_id == "TEST-APPEAL-001"))
    assert (
        logged.post(
            "/api/claims/TEST-APPEAL-001/notes",
            json={"text": "Supporting synthetic evidence reviewed."},
        ).status_code
        == 201
    )
    assert (
        logged.put(
            "/api/claims/TEST-APPEAL-001/assignment",
            json={
                "user_id": 2,
                "priority": "High",
                "recovery_status": "Resolved",
                "action": "Appeal resolved.",
            },
        ).status_code
        == 200
    )
    assert len(logged.get("/api/claims/TEST-APPEAL-001").json()["actions"]) == 1


def test_known_metrics_and_age_buckets():
    df = pd.DataFrame(
        [
            {
                "id": "a",
                "status": "Paid",
                "amount": 1000.0,
                "paid_amount": 720.0,
                "adjustment": 280.0,
                "expected_reimbursement": 720.0,
                "outstanding": 0.0,
                "days_outstanding": 0,
                "adjudicated": True,
                "was_denied": False,
                "at_risk": False,
                "underpayment": 0.0,
            },
            {
                "id": "b",
                "status": "Denied",
                "amount": 2000.0,
                "paid_amount": 0.0,
                "adjustment": 560.0,
                "expected_reimbursement": 1440.0,
                "outstanding": 1440.0,
                "days_outstanding": 100,
                "adjudicated": True,
                "was_denied": True,
                "at_risk": True,
                "underpayment": 0.0,
            },
            {
                "id": "c",
                "status": "Partially Paid",
                "amount": 1000.0,
                "paid_amount": 400.0,
                "adjustment": 280.0,
                "expected_reimbursement": 720.0,
                "outstanding": 320.0,
                "days_outstanding": 30,
                "adjudicated": True,
                "was_denied": False,
                "at_risk": False,
                "underpayment": 320.0,
            },
            {
                "id": "d",
                "status": "Submitted",
                "amount": 500.0,
                "paid_amount": 0.0,
                "adjustment": 140.0,
                "expected_reimbursement": 360.0,
                "outstanding": 360.0,
                "days_outstanding": 31,
                "adjudicated": False,
                "was_denied": False,
                "at_risk": False,
                "underpayment": 0.0,
            },
        ]
    )
    k = summarize(df)
    assert k["denial_rate"] == 33.33
    assert k["outstanding"] == 2120
    assert k["avg_days_ar"] == 53.7
    assert k["revenue_at_risk"] == 1440
    assert [r["amount"] for r in aging(df)] == [320, 360, 0, 1440, 0]
    assert k["underpayment"] == 320


def test_priority_components():
    r = risk_components(
        {
            "outstanding": 12000,
            "days_outstanding": 150,
            "status": "Denied",
            "appeal_deadline": date.today() + timedelta(days=2),
            "denial_reason": "Missing documentation",
        },
        0.2,
    )
    assert r["score"] == 98
    assert r["priority"] == "Critical"
    assert sum(r["components"].values()) == r["score"]
    assert "documentation" in r["recommendation"]


def test_csv_upload_validation_duplicates_and_error_report(logged):
    template = logged.get("/api/ingestion/template")
    assert template.status_code == 200
    contents = "id,patient_id,provider_id,payer_id,submission_date,service_date,amount,status\n"
    today = str(date.today())
    contents += f"CSV-TEST-001,SYN-CSV,1,1,{today},{today},500,Submitted\n" * 2
    contents += f"CSV-INVALID,SYN-CSV,1,1,{today},{today},-1,Submitted\n"
    r = logged.post(
        "/api/ingestion/csv", files={"file": ("test.csv", contents, "text/csv")}
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert (data["total"], data["valid"], data["rejected"], data["duplicates"]) == (
        3,
        1,
        1,
        1,
    )
    report = logged.get(f'/api/ingestion/{data["id"]}/errors')
    assert "duplicate" in report.text and "validation" in report.text
    assert logged.get("/api/data-quality").json()["totals"]["total"] >= 3


def test_webhook_hmac_and_idempotence(client):
    old = settings.webhook_secret
    settings.webhook_secret = "test-webhook-secret"
    try:
        body = json.dumps({"records": [payload("HOOK-TEST-001")]}).encode()
        ts = str(int(time.time()))
        assert client.post("/api/ingestion/webhook", content=body).status_code == 401
        signature = hmac.new(
            settings.webhook_secret.encode(), ts.encode() + b"." + body, hashlib.sha256
        ).hexdigest()
        headers = {"X-CP-Timestamp": ts, "X-CP-Signature": signature}
        assert (
            client.post("/api/ingestion/webhook", content=body, headers=headers).json()[
                "valid"
            ]
            == 1
        )
        assert (
            client.post("/api/ingestion/webhook", content=body, headers=headers).json()[
                "duplicates"
            ]
            == 1
        )
    finally:
        settings.webhook_secret = old


def test_seed_relationships_and_balances(db):
    assert db.scalar(select(func.count()).select_from(Claim)) >= 700
    assert (
        db.scalar(
            select(func.count())
            .select_from(Claim)
            .where(Claim.paid_amount + Claim.adjustment > Claim.amount)
        )
        == 0
    )
    assert (
        db.scalar(
            select(func.count())
            .select_from(Claim)
            .outerjoin(Denial, Denial.claim_id == Claim.id)
            .where(
                Claim.status.in_(["Denied", "Appealed", "Recovered"]), Denial.id == None
            )
        )
        == 0
    )
    assert (
        db.scalar(
            select(func.count())
            .select_from(Claim)
            .outerjoin(Payment, Payment.claim_id == Claim.id)
            .where(Claim.paid_amount > 0, Payment.id == None)
        )
        == 0
    )


def test_dashboard_reconciliation_and_exports(logged, db):
    start = date.today() - timedelta(days=89)
    end = date.today()
    r = logged.get(f"/api/analytics/dashboard?start={start}&end={end}")
    assert r.status_code == 200, r.text
    data = r.json()
    df = load_frame(db, start, end)
    assert data["kpis"] == summarize(df)
    assert (
        round(sum(a["amount"] for a in data["aging"]), 2) == data["kpis"]["outstanding"]
    )
    payers = logged.get("/api/analytics/payers").json()["items"]
    assert (
        round(sum(p["outstanding"] for p in payers), 2) == data["kpis"]["outstanding"]
    )
    for kind in [
        "claims",
        "denials",
        "payers",
        "revenue-risk",
        "aging",
        "recovery",
        "underpayments",
    ]:
        assert logged.get("/api/exports/" + kind).status_code == 200


def test_copilot_evidence_and_rejection(logged):
    r = logged.post("/api/copilot", json={"question": "What is the revenue at risk?"})
    assert r.status_code == 200, r.text
    assert r.json()["evidence"][0]["amount"] >= 0
    assert (
        logged.post("/api/copilot", json={"question": "DROP TABLE claims;"}).json()[
            "intent"
        ]
        == "unknown"
    )
    for q in [
        "Top three denial reasons",
        "Which payer has the highest denial rate?",
        "Which claims are over 90 days?",
        "What should I review first?",
        "What changed in the denial rate?",
    ]:
        assert logged.post("/api/copilot", json={"question": q}).status_code == 200


def test_ml_training_inference_and_features(logged):
    r = logged.post("/api/ml/train")
    assert r.status_code == 200, r.text
    report = r.json()
    assert len(report["models"]) == 2
    assert (
        report["train_count"] + report["validation_count"] + report["test_count"]
        == report["sample_count"]
    )
    assert not {
        "status",
        "denial_reason",
        "paid_amount",
        "appeal_deadline",
        "outstanding",
    } & set(report["features"])
    p = logged.post("/api/ml/predict/CLM-000001")
    assert p.status_code == 200, p.text
    assert 0 <= p.json()["estimated_risk"] <= 100


def test_websocket_event(logged):
    import anyio
    from app.websocket.hub import hub

    with logged.websocket_connect("/api/ws") as ws:
        logged.portal.call(hub.publish, "test_event", {"synthetic": True})
        data = ws.receive_json()
        assert data["type"] == "test_event"


def test_csrf_and_role_settings(logged):
    assert (
        logged.post(
            "/api/auth/demo", headers={"Origin": "https://untrusted.invalid"}
        ).status_code
        == 403
    )
    assert (
        logged.put(
            "/api/settings",
            json={
                "high_value": 5000,
                "aging_days": 60,
                "deadline_days": 10,
                "dark_mode": True,
            },
        ).status_code
        == 200
    )
    assert (
        logged.get("/api/auth/me").json()["preferences"]["thresholds"]["high_value"]
        == 5000
    )


def test_simulator_lifecycle(database):
    sim = Simulator()
    sim.target = 1
    for _ in range(15):
        result = sim.tick()
        if result.get("message"):
            break
    assert sim.generated == 1 and sim.events >= 3


def test_recovered_ledger_survives_closed_state(logged, db):
    data = payload("REGRESSION-RECOVERY")
    data.update(status="Denied", denial_reason="Incorrect coding")
    assert logged.post("/api/claims", json=data).status_code == 201
    assert (
        logged.patch(
            "/api/claims/REGRESSION-RECOVERY", json={"status": "Appealed"}
        ).status_code
        == 200
    )
    assert (
        logged.patch(
            "/api/claims/REGRESSION-RECOVERY",
            json={"status": "Recovered", "paid_amount": "720.00"},
        ).status_code
        == 200
    )
    assert (
        logged.patch(
            "/api/claims/REGRESSION-RECOVERY", json={"status": "Closed"}
        ).status_code
        == 200
    )
    df = load_frame(db)
    one = df[df.id == "REGRESSION-RECOVERY"]
    assert summarize(one)["recovered"] == 720
    assert summarize(one)["denied_claims"] == 1
    assert summarize(one)["outstanding"] == 0


def test_draft_balances_excluded_from_ar(logged, db):
    data = payload("REGRESSION-DRAFT")
    data["status"] = "Draft"
    assert logged.post("/api/claims", json=data).status_code == 201
    df = load_frame(db)
    one = df[df.id == "REGRESSION-DRAFT"]
    k = summarize(one)
    assert k["total_claims"] == 0 and k["outstanding"] == 0 and k["billed"] == 0


def test_source_archive_omits_runtime_secrets(logged):
    import zipfile

    response = logged.get("/api/source")
    assert response.status_code == 200
    archive = zipfile.ZipFile(io.BytesIO(response.content))
    names = archive.namelist()
    assert any(n.endswith("backend/app/main.py") for n in names)
    assert not any(
        n.endswith("/.env")
        or "/node_modules/" in n
        or "/.venv/" in n
        or n.endswith(".joblib")
        for n in names
    )


def test_unknown_login_and_forbidden_extra_fields(client, logged):
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "missing@example.org", "password": "not-a-real-password"},
        ).status_code
        == 401
    )
    data = payload("STRICT-SCHEMA-001")
    data["patient_name"] = "Not accepted"
    assert logged.post("/api/claims", json=data).status_code == 422
    assert (
        logged.post("/api/claims/CLM-000001/notes", json={"text": "   "}).status_code
        == 422
    )
    assert (
        client.post(
            "/api/auth/register",
            json={
                "name": "Valid Name",
                "email": "extra@example.org",
                "password": "Test-only-password-123",
                "role": "admin",
            },
        ).status_code
        == 422
    )


def test_submission_features_freeze_after_outcome(logged):
    data = payload("FEATURE-FREEZE-001")
    assert logged.post("/api/claims", json=data).status_code == 201
    assert (
        logged.patch(
            "/api/claims/FEATURE-FREEZE-001", json={"documentation_complete": False}
        ).status_code
        == 200
    )
    assert (
        logged.patch(
            "/api/claims/FEATURE-FREEZE-001",
            json={"status": "Paid", "paid_amount": "720.00"},
        ).status_code
        == 200
    )
    assert (
        logged.patch(
            "/api/claims/FEATURE-FREEZE-001", json={"documentation_complete": True}
        ).status_code
        == 422
    )
