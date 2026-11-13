import os
from pathlib import Path
import pytest
from dotenv import dotenv_values
import psycopg

# Always use a dedicated test database; never destroy the running workspace.
values = dotenv_values(Path(__file__).resolve().parents[2] / ".env")
base = os.environ.get("TEST_DATABASE_URL", values.get("DATABASE_URL", ""))
if not base:
    raise RuntimeError("Configure TEST_DATABASE_URL or local .env before testing")
url = base.rsplit("/", 1)[0] + "/claimpulse_test"
os.environ["DATABASE_URL"] = url
os.environ["DEMO_MODE"] = "true"
os.environ.setdefault(
    "JWT_SECRET", "test-suite-only-key-with-at-least-thirty-two-characters"
)
from app.core.config import settings

settings.database_url = url
settings.artifacts_dir = str(Path(__file__).resolve().parents[2] / "work/test-models")
with psycopg.connect(
    base.replace("postgresql+psycopg:", "postgresql:"), autocommit=True
) as conn:
    exists = conn.execute(
        "SELECT 1 FROM pg_database WHERE datname='claimpulse_test'"
    ).fetchone()
    if not exists:
        conn.execute("CREATE DATABASE claimpulse_test")
from app.core.database import engine, SessionLocal, Base, get_db
from app.models.entities import *
from app.services.seed import seed
from app.main import app
from fastapi.testclient import TestClient


@pytest.fixture(scope="session", autouse=True)
def database():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seed(700)
    yield


@pytest.fixture
def db(database):
    with engine.connect() as connection:
        transaction = connection.begin()
        session = SessionLocal(
            bind=connection, join_transaction_mode="create_savepoint"
        )
        yield session
        session.close()
        transaction.rollback()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def logged(client):
    assert client.post("/api/auth/demo").status_code == 200
    return client
