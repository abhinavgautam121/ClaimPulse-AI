from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import (
    String,
    Integer,
    Boolean,
    Date,
    DateTime,
    Numeric,
    ForeignKey,
    JSON,
    CheckConstraint,
    Index,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

Money = Numeric(14, 2)


def utcnow():
    return datetime.now(timezone.utc)


class Stamp:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class Role(Base):
    __tablename__ = "roles"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True)


class User(Stamp, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(80))
    password_hash: Mapped[str] = mapped_column(Text)
    role_id: Mapped[int] = mapped_column(ForeignKey("roles.id"))
    active: Mapped[bool] = mapped_column(default=True)
    token_version: Mapped[int] = mapped_column(default=0)
    preferences: Mapped[dict] = mapped_column(JSON, default=dict)


class Provider(Stamp, Base):
    __tablename__ = "providers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    specialty: Mapped[str] = mapped_column(String(80), index=True)
    synthetic: Mapped[bool] = mapped_column(default=True)


class Payer(Stamp, Base):
    __tablename__ = "payers"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    synthetic: Mapped[bool] = mapped_column(default=True)


class Patient(Stamp, Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    synthetic: Mapped[bool] = mapped_column(default=True)
    __table_args__ = (CheckConstraint("synthetic = true"),)


class DataSource(Stamp, Base):
    __tablename__ = "data_sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100), unique=True)
    kind: Mapped[str] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="not_connected")
    last_sync: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class Claim(Stamp, Base):
    __tablename__ = "claims"
    id: Mapped[str] = mapped_column(String(50), primary_key=True)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id"), index=True)
    provider_id: Mapped[int] = mapped_column(ForeignKey("providers.id"), index=True)
    payer_id: Mapped[int] = mapped_column(ForeignKey("payers.id"), index=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"), index=True)
    submission_date: Mapped[date] = mapped_column(Date, index=True)
    service_date: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money)
    paid_amount: Mapped[Decimal] = mapped_column(Money, default=0)
    adjustment: Mapped[Decimal] = mapped_column(Money, default=0)
    expected_reimbursement: Mapped[Decimal] = mapped_column(Money, default=0)
    patient_responsibility: Mapped[Decimal] = mapped_column(Money, default=0)
    expected_basis: Mapped[str] = mapped_column(
        String(100), default="Synthetic contract assumption: 72% of billed"
    )
    status: Mapped[str] = mapped_column(String(25), index=True)
    denial_reason: Mapped[str | None] = mapped_column(String(100), index=True)
    appeal_deadline: Mapped[date | None] = mapped_column(Date, index=True)
    procedure_category: Mapped[str] = mapped_column(String(80), default="Office visit")
    diagnosis_category: Mapped[str] = mapped_column(String(80), default="General")
    authorized: Mapped[bool] = mapped_column(default=True)
    documentation_complete: Mapped[bool] = mapped_column(default=True)
    eligibility_verified: Mapped[bool] = mapped_column(default=True)
    prior_denials: Mapped[int] = mapped_column(default=0)
    synthetic: Mapped[bool] = mapped_column(default=True)
    ingested_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    __table_args__ = (
        CheckConstraint(
            "amount > 0 AND paid_amount >= 0 AND adjustment >= 0 AND expected_reimbursement >= 0 AND patient_responsibility >= 0"
        ),
        CheckConstraint("paid_amount + adjustment <= amount"),
        CheckConstraint("service_date <= submission_date"),
        CheckConstraint(
            "status IN ('Draft','Submitted','Processing','Paid','Partially Paid','Denied','Appealed','Recovered','Closed')"
        ),
        CheckConstraint("synthetic = true"),
        Index("ix_claim_cohort", "submission_date", "status", "payer_id"),
    )


class Procedure(Base):
    __tablename__ = "procedures"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    category: Mapped[str] = mapped_column(String(80))


class Diagnosis(Base):
    __tablename__ = "diagnoses"
    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    category: Mapped[str] = mapped_column(String(80))


class ClaimLine(Stamp, Base):
    __tablename__ = "claim_lines"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(
        ForeignKey("claims.id", ondelete="CASCADE"), index=True
    )
    procedure_id: Mapped[int] = mapped_column(ForeignKey("procedures.id"))
    diagnosis_id: Mapped[int] = mapped_column(ForeignKey("diagnoses.id"))
    amount: Mapped[Decimal] = mapped_column(Money)
    __table_args__ = (CheckConstraint("amount > 0"),)


class Denial(Stamp, Base):
    __tablename__ = "denials"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), unique=True)
    reason: Mapped[str] = mapped_column(String(100))
    amount: Mapped[Decimal] = mapped_column(Money)
    denial_date: Mapped[date] = mapped_column(Date)
    __table_args__ = (CheckConstraint("amount >= 0"),)


class Payment(Stamp, Base):
    __tablename__ = "payments"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    payment_date: Mapped[date] = mapped_column(Date)
    recovered: Mapped[bool] = mapped_column(default=False)
    __table_args__ = (CheckConstraint("amount > 0"),)


class Appeal(Stamp, Base):
    __tablename__ = "appeals"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    filed_date: Mapped[date] = mapped_column(Date)
    resolved_date: Mapped[date | None] = mapped_column(Date)
    outcome: Mapped[str] = mapped_column(String(20), default="Pending")
    __table_args__ = (
        CheckConstraint("outcome IN ('Pending','Successful','Unsuccessful')"),
    )


class ClaimNote(Stamp, Base):
    __tablename__ = "claim_notes"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)


class Assignment(Stamp, Base):
    __tablename__ = "claim_assignments"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), unique=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    priority: Mapped[str | None] = mapped_column(String(20))
    recovery_status: Mapped[str] = mapped_column(String(30), default="Open")


class ClaimEvent(Stamp, Base):
    __tablename__ = "claim_events"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    kind: Mapped[str] = mapped_column(String(60))
    message: Mapped[str] = mapped_column(String(300))
    source: Mapped[str] = mapped_column(String(80))
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class RecoveryAction(Stamp, Base):
    __tablename__ = "recovery_actions"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(Text)


class Underpayment(Stamp, Base):
    __tablename__ = "underpayments"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str] = mapped_column(ForeignKey("claims.id"), unique=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    basis: Mapped[str] = mapped_column(String(150))
    __table_args__ = (CheckConstraint("amount > 0"),)


class IngestionJob(Stamp, Base):
    __tablename__ = "ingestion_jobs"
    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("data_sources.id"))
    filename: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30))
    total: Mapped[int] = mapped_column(default=0)
    valid: Mapped[int] = mapped_column(default=0)
    rejected: Mapped[int] = mapped_column(default=0)
    duplicates: Mapped[int] = mapped_column(default=0)
    missing: Mapped[int] = mapped_column(default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)


class AuditLog(Stamp, Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    action: Mapped[str] = mapped_column(String(80))
    entity: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict] = mapped_column(JSON, default=dict)


class Notification(Stamp, Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    claim_id: Mapped[str | None] = mapped_column(ForeignKey("claims.id"), index=True)
    title: Mapped[str] = mapped_column(String(200))
    priority: Mapped[str] = mapped_column(String(20))
    kind: Mapped[str] = mapped_column(String(60))
    read_by: Mapped[list] = mapped_column(JSON, default=list)
    __table_args__ = (Index("ix_notification_dedupe", "claim_id", "kind"),)
