"""Normalized schema and analytical views."""

from alembic import op
from app.core.database import Base
from app.models import entities

revision = "001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    Base.metadata.create_all(op.get_bind())
    op.execute(
        """CREATE VIEW vw_claim_summary AS SELECT c.*, p.name AS payer, pr.name AS provider,
    pr.specialty, GREATEST(c.amount-c.paid_amount-c.adjustment,0) AS outstanding,
    CASE WHEN c.amount>c.paid_amount+c.adjustment THEN GREATEST(CURRENT_DATE-c.submission_date,0) ELSE 0 END AS days_outstanding
    FROM claims c JOIN payers p ON c.payer_id=p.id JOIN providers pr ON c.provider_id=pr.id"""
    )
    op.execute(
        """CREATE VIEW vw_denial_analysis AS SELECT d.reason, COUNT(*) AS claims,
    SUM(d.amount) AS denied_amount FROM denials d GROUP BY d.reason"""
    )
    op.execute(
        """CREATE VIEW vw_payer_performance AS SELECT p.id, p.name, COUNT(c.id) AS claims,
    COUNT(d.id) AS denied, SUM(c.amount) AS billed, SUM(c.paid_amount) AS paid,
    SUM(c.amount-c.paid_amount-c.adjustment) AS outstanding
    FROM payers p LEFT JOIN claims c ON c.payer_id=p.id LEFT JOIN denials d ON d.claim_id=c.id GROUP BY p.id,p.name"""
    )
    op.execute(
        """CREATE VIEW vw_ar_aging AS SELECT CASE WHEN days_outstanding<=30 THEN '0–30'
    WHEN days_outstanding<=60 THEN '31–60' WHEN days_outstanding<=90 THEN '61–90'
    WHEN days_outstanding<=120 THEN '91–120' ELSE '120+' END AS bucket,
    COUNT(*) AS claims,SUM(outstanding) AS amount FROM vw_claim_summary WHERE outstanding>0 GROUP BY 1"""
    )
    op.execute(
        """CREATE VIEW vw_revenue_at_risk AS SELECT id, payer_id, outstanding, days_outstanding,
    appeal_deadline,status FROM vw_claim_summary WHERE outstanding>0 AND (days_outstanding>90 OR status IN ('Denied','Appealed'))"""
    )
    op.execute(
        """CREATE VIEW vw_recovery_performance AS SELECT DATE_TRUNC('month',payment_date)::date AS month,
    SUM(amount) AS recovered FROM payments WHERE recovered=true GROUP BY 1"""
    )


def downgrade():
    for name in [
        "vw_recovery_performance",
        "vw_revenue_at_risk",
        "vw_ar_aging",
        "vw_payer_performance",
        "vw_denial_analysis",
        "vw_claim_summary",
    ]:
        op.execute("DROP VIEW IF EXISTS " + name)
    Base.metadata.drop_all(op.get_bind())
