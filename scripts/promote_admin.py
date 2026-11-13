"""Promote an existing account through an explicit local administrator operation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy import select
from app.core.database import SessionLocal
from app.models.entities import User, AuditLog

if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/promote_admin.py account@example.org")
with SessionLocal() as db:
    user = db.scalar(select(User).where(User.email == sys.argv[1].lower()))
    if not user:
        raise SystemExit("Account not found. Register it first.")
    user.role_id = 1
    user.token_version += 1
    db.add(
        AuditLog(
            user_id=user.id,
            action="local_admin_promotion",
            entity="user",
            details={"account_id": user.id},
        )
    )
    db.commit()
    print("Account promoted. Sign in again to continue.")
