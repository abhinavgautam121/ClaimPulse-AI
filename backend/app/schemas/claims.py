from datetime import date
from decimal import Decimal
from typing import Literal
from pydantic import (
    BaseModel,
    Field,
    model_validator,
    EmailStr,
    ConfigDict,
    field_validator,
)


class InputModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


Status = Literal[
    "Draft",
    "Submitted",
    "Processing",
    "Paid",
    "Partially Paid",
    "Denied",
    "Appealed",
    "Recovered",
    "Closed",
]
REASONS = [
    "Missing documentation",
    "Incorrect coding",
    "Eligibility issues",
    "Prior authorisation",
    "Medical necessity",
    "Duplicate claims",
    "Timely filing",
    "Incorrect patient information",
    "Payer-specific requirements",
]
TRANSITIONS = {
    "Draft": ["Submitted", "Closed"],
    "Submitted": ["Processing", "Denied", "Paid", "Partially Paid", "Closed"],
    "Processing": ["Paid", "Partially Paid", "Denied", "Closed"],
    "Denied": ["Appealed", "Closed"],
    "Appealed": ["Recovered", "Denied", "Closed"],
    "Partially Paid": ["Paid", "Appealed", "Closed"],
    "Paid": ["Closed"],
    "Recovered": ["Closed"],
    "Closed": [],
}


class ClaimCreate(InputModel):
    id: str = Field(min_length=3, max_length=50, pattern=r"^[A-Za-z0-9_-]+$")
    patient_id: str = Field(pattern=r"^SYN-[A-Za-z0-9-]+$", max_length=40)
    provider_id: int = Field(gt=0)
    payer_id: int = Field(gt=0)
    submission_date: date
    service_date: date
    amount: Decimal = Field(gt=0, le=10000000, decimal_places=2)
    paid_amount: Decimal = Field(default=Decimal(0), ge=0, decimal_places=2)
    adjustment: Decimal = Field(default=Decimal(0), ge=0, decimal_places=2)
    expected_reimbursement: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    patient_responsibility: Decimal = Field(default=Decimal(0), ge=0, decimal_places=2)
    status: Status = "Submitted"
    denial_reason: str | None = None
    appeal_deadline: date | None = None
    procedure_category: str = Field(default="Office visit", max_length=80)
    diagnosis_category: str = Field(default="General", max_length=80)
    authorized: bool = True
    documentation_complete: bool = True
    eligibility_verified: bool = True
    prior_denials: int = Field(default=0, ge=0, le=100)
    synthetic: Literal[True] = True

    @model_validator(mode="after")
    def validate_consistency(self):
        if (
            self.service_date > self.submission_date
            or self.submission_date > date.today()
        ):
            raise ValueError(
                "Service must be on/before submission; submission cannot be in the future."
            )
        if self.paid_amount + self.adjustment > self.amount:
            raise ValueError("Payment plus adjustment cannot exceed billed amount.")
        if (
            self.expected_reimbursement is not None
            and self.expected_reimbursement > self.amount
        ):
            raise ValueError("Expected reimbursement cannot exceed billed amount.")
        if (
            self.status in ["Denied", "Appealed", "Recovered"]
            and self.denial_reason not in REASONS
        ):
            raise ValueError(
                "A valid denial reason is required for denial and recovery history."
            )
        if (
            self.status not in ["Denied", "Appealed", "Recovered", "Closed"]
            and self.denial_reason
        ):
            raise ValueError("Denial reason is inconsistent with claim status.")
        if self.status in ["Paid", "Recovered"] and (
            self.paid_amount <= 0 or self.paid_amount + self.adjustment != self.amount
        ):
            raise ValueError(
                "Paid/recovered claims must have a payment and no remaining balance."
            )
        if (
            self.status in ["Draft", "Submitted", "Processing", "Denied"]
            and self.paid_amount
        ):
            raise ValueError(
                "This status does not allow a payment; use Partially Paid."
            )
        if self.status == "Partially Paid" and not (
            0 < self.paid_amount < self.amount - self.adjustment
        ):
            raise ValueError(
                "Partially Paid requires a positive payment and remaining balance."
            )
        if (
            self.status == "Closed"
            and self.paid_amount + self.adjustment != self.amount
        ):
            raise ValueError("Closed claims must have no outstanding balance.")
        return self


class ClaimUpdate(InputModel):
    status: Status | None = None
    amount: Decimal | None = Field(default=None, gt=0, le=10000000, decimal_places=2)
    paid_amount: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    adjustment: Decimal | None = Field(default=None, ge=0, decimal_places=2)
    denial_reason: str | None = None
    appeal_deadline: date | None = None
    authorized: bool | None = None
    documentation_complete: bool | None = None
    eligibility_verified: bool | None = None


class Registration(InputModel):
    name: str = Field(min_length=2, max_length=80)

    @field_validator("name")
    @classmethod
    def meaningful_name(cls, value):
        if len(value.strip()) < 2:
            raise ValueError("Enter a name with at least two characters.")
        return value.strip()

    email: EmailStr
    password: str = Field(min_length=12, max_length=128)


class Login(InputModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class NoteInput(InputModel):
    text: str = Field(min_length=1, max_length=4000)

    @field_validator("text")
    @classmethod
    def meaningful_note(cls, value):
        if not value.strip():
            raise ValueError("A note must contain text.")
        return value.strip()


class WorkInput(InputModel):
    user_id: int | None = None
    priority: Literal["Critical", "High", "Medium", "Low"] | None = None
    recovery_status: Literal["Open", "In review", "Waiting on payer", "Resolved"] = (
        "Open"
    )
    action: str = Field(default="", max_length=2000)
