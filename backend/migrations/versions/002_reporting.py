"""Align SQL reports with central historical-denial and draft conventions."""

from alembic import op

revision = "002_reporting"
down_revision = "001_initial"
branch_labels = None
depends_on = None


def upgrade():
    for view in [
        "vw_ar_aging",
        "vw_revenue_at_risk",
        "vw_payer_performance",
        "vw_claim_summary",
    ]:
        op.execute("DROP VIEW " + view)
    op.execute(
        """CREATE VIEW vw_claim_summary AS
      SELECT c.*, p.name AS payer, pr.name AS provider, pr.specialty,
      CASE WHEN c.status='Draft' THEN 0 ELSE GREATEST(c.amount-c.paid_amount-c.adjustment,0) END AS outstanding,
      CASE WHEN c.status<>'Draft' AND c.amount>c.paid_amount+c.adjustment THEN GREATEST(CURRENT_DATE-c.submission_date,0) ELSE 0 END AS days_outstanding,
      EXISTS(SELECT 1 FROM denials d WHERE d.claim_id=c.id) AS was_denied,
      c.status IN ('Paid','Partially Paid','Denied','Appealed','Recovered','Closed') AS adjudicated,
      COALESCE((SELECT SUM(pm.amount) FROM payments pm WHERE pm.claim_id=c.id AND pm.recovered=true),0) AS recovered_amount
      FROM claims c JOIN payers p ON p.id=c.payer_id JOIN providers pr ON pr.id=c.provider_id"""
    )
    op.execute(
        """CREATE VIEW vw_payer_performance AS SELECT payer_id,payer,
      COUNT(*) FILTER(WHERE status<>'Draft') AS submitted_claims,
      COUNT(*) FILTER(WHERE was_denied AND adjudicated) AS denied_claims,
      COUNT(*) FILTER(WHERE adjudicated) AS adjudicated_claims,
      COALESCE(100.0*COUNT(*) FILTER(WHERE was_denied AND adjudicated)/NULLIF(COUNT(*) FILTER(WHERE adjudicated),0),0) AS denial_rate,
      SUM(amount) FILTER(WHERE status<>'Draft') AS billed, SUM(paid_amount) AS paid,
      SUM(outstanding) AS outstanding,SUM(recovered_amount) AS recovered
      FROM vw_claim_summary GROUP BY payer_id,payer"""
    )
    op.execute(
        """CREATE VIEW vw_ar_aging AS SELECT CASE WHEN days_outstanding<=30 THEN '0–30'
      WHEN days_outstanding<=60 THEN '31–60' WHEN days_outstanding<=90 THEN '61–90'
      WHEN days_outstanding<=120 THEN '91–120' ELSE '120+' END AS bucket,
      COUNT(*) AS claims,SUM(outstanding) AS amount FROM vw_claim_summary WHERE outstanding>0 GROUP BY 1"""
    )
    op.execute(
        """CREATE VIEW vw_revenue_at_risk AS SELECT id,payer_id,outstanding,days_outstanding,appeal_deadline,status
      FROM vw_claim_summary WHERE outstanding>0 AND (days_outstanding>90 OR status IN ('Denied','Appealed'))"""
    )
    op.execute(
        "ALTER TABLE claims ADD CONSTRAINT ck_expected_within_billed CHECK(expected_reimbursement <= amount)"
    )
    op.execute(
        "ALTER TABLE patients ADD CONSTRAINT ck_synthetic_reference CHECK(id LIKE 'SYN-%')"
    )
    op.execute("CREATE INDEX ix_payment_recovery ON payments(recovered,claim_id)")


def downgrade():
    # Views depend on the additional reporting convention, so schema reversal is intentionally explicit.
    op.execute("DROP INDEX IF EXISTS ix_payment_recovery")
    op.execute("ALTER TABLE patients DROP CONSTRAINT ck_synthetic_reference")
    op.execute("ALTER TABLE claims DROP CONSTRAINT ck_expected_within_billed")
    for view in [
        "vw_ar_aging",
        "vw_revenue_at_risk",
        "vw_payer_performance",
        "vw_claim_summary",
    ]:
        op.execute("DROP VIEW " + view)
    op.execute(
        """CREATE VIEW vw_claim_summary AS SELECT c.*,p.name AS payer,pr.name AS provider,pr.specialty,
    GREATEST(c.amount-c.paid_amount-c.adjustment,0) AS outstanding,
    CASE WHEN c.amount>c.paid_amount+c.adjustment THEN GREATEST(CURRENT_DATE-c.submission_date,0) ELSE 0 END AS days_outstanding
    FROM claims c JOIN payers p ON p.id=c.payer_id JOIN providers pr ON pr.id=c.provider_id"""
    )
    op.execute(
        """CREATE VIEW vw_payer_performance AS SELECT p.id,p.name,COUNT(c.id) AS claims,COUNT(d.id) AS denied,SUM(c.amount) AS billed,SUM(c.paid_amount) AS paid,SUM(c.amount-c.paid_amount-c.adjustment) AS outstanding FROM payers p LEFT JOIN claims c ON c.payer_id=p.id LEFT JOIN denials d ON d.claim_id=c.id GROUP BY p.id,p.name"""
    )
    op.execute(
        """CREATE VIEW vw_ar_aging AS SELECT CASE WHEN days_outstanding<=30 THEN '0–30' WHEN days_outstanding<=60 THEN '31–60' WHEN days_outstanding<=90 THEN '61–90' WHEN days_outstanding<=120 THEN '91–120' ELSE '120+' END AS bucket,COUNT(*) AS claims,SUM(outstanding) AS amount FROM vw_claim_summary WHERE outstanding>0 GROUP BY 1"""
    )
    op.execute(
        "CREATE VIEW vw_revenue_at_risk AS SELECT id,payer_id,outstanding,days_outstanding,appeal_deadline,status FROM vw_claim_summary WHERE outstanding>0 AND (days_outstanding>90 OR status IN ('Denied','Appealed'))"
    )
