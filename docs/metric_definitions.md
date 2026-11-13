# Metric definitions and conventions

Every view and export uses the same central implementation in `backend/app/analytics/metrics.py`. Reports use inclusive **claim submission dates**, USD and calendar days in UTC. Seed dates are relative to the date of seeding. A date-only record is displayed in UTC to prevent browser timezone shifts. Zero-denominator metrics return 0 with the denominator/sample shown where applicable; absent mean reimbursement time is null, never a fabricated number.

| Metric | Calculation / denominator |
|---|---|
| Claims submitted | Count distinct stored claim IDs with status other than Draft in the selected submission cohort |
| Denied claims | Claims with a historical denial record and a current adjudicated status |
| Adjudicated outcomes | Paid, Partially Paid, Denied, Appealed, Recovered or Closed; excludes Draft, Submitted and Processing |
| Denial rate | Historical denied claims / adjudicated claims × 100; recovered and closed denied claims retain denial history |
| Total billed | Sum original charges for non-Draft claims; charges are not allowed amounts or collectible revenue |
| Net outstanding | max(billed − recorded payments − applicable contractual adjustments, 0). Operational aggregates exclude Draft balances. Includes patient balances; it is not a measure of insurer-only collectibility |
| Revenue at risk | Net outstanding on Denied/Appealed claims or positive balances aged **more than 90 days**. Operational review exposure, not expected loss |
| Recovered amount | Sum payment-ledger entries marked recovered, including claims subsequently Closed |
| Recovery rate | Recovered payments / original expected insurer reimbursement of historically denied claims × 100 |
| Average days in A/R | Unweighted mean of (report execution date − submission date), among non-Draft claims with a positive balance. This is an operational age statistic, not the accounting formula A/R ÷ average daily net revenue |
| Ageing | 0–30, 31–60, 61–90, 91–120, above 120 calendar days; only positive, non-Draft balances |
| Average reimbursement time | Mean days from submission to the latest recorded payment, over claims with payments in the submission cohort. Includes partial payment records; not a forecast |
| Appeal success | Successful appeals / resolved appeals (Successful or Unsuccessful); Pending excluded |
| Potential underpayment | max(expected insurer reimbursement − actual recorded reimbursement, 0) on Paid/Partially Paid claims with a recorded payment. All expected amounts are explicitly synthetic contract assumptions (72% of billed) |
| Payer score | 0.6 × (100 − denial rate) + 0.4 × max(0,100 − average reimbursement days). Withheld below 30 adjudicated claims. Missing payment time contributes zero timeliness points. This is a descriptive synthetic score, not an insurer quality ranking |
| Period comparisons | Same-length immediately preceding submission cohort. Percent changes vs prior value; no comparison when the prior value is zero. Denial-rate Copilot changes use percentage points |

## Financial examples

A $1,000 synthetic billed claim has a $720 assumed expected insurer reimbursement and a $280 contractual adjustment. A $400 recorded payment leaves $320 outstanding. If adjudicated as Partially Paid, the synthetic underpayment review gap is $720 − $400 = $320. A submitted claim with no payment is not automatically labelled underpaid.

An initially denied $720 expected amount that is appealed, recovered and later closed remains part of both historical denied value and recovered payments. Its outstanding balance is zero. Denial reason charts represent original denied **expected reimbursement**, not billed charges and not current outstanding.

## Priority engine

Amount exposure: min(25, outstanding / 10,000 × 25). Age: min(25, days / 120 × 25). Denied or Appealed status: 20. Deadline: 20 if due within 7 days or expired; 12 if due in 8–30 days; otherwise 0. Historical recovery: 10 × (1 − smoothed payer recovery fraction). The fraction is (historically recovered denied claims + 1) / (historically denied claims + 2), from persisted payer history. An unsuccessful previous appeal halves that descriptive fraction for the current claim. It is not a calibrated recovery probability.

Critical ≥75; High ≥55; Medium ≥30; Low otherwise. Manual priority overrides take precedence in the worklist and are labelled. An expired deadline yields a review recommendation for payer exceptions; no promise of appeal acceptance is made.

## Lifecycle and exceptional cases

No deletion or silent overwrite: duplicate IDs are reported. Payments cannot be reduced through the claim editor; reversals require a separate reconciliation workflow outside this prototype. Closed claims must have a zero balance (payments plus adjustment equal charges). The prototype has no cancelled/void state; use an audited Closed transition with the appropriate adjustment. It does not model insurer recoupments, reversals, multiple currencies or line-level remittance allocation. Patient responsibility is informational and remains in the net balance until paid or adjusted.

## SQL reporting views

`vw_claim_summary`, `vw_denial_analysis`, `vw_payer_performance`, `vw_ar_aging`, `vw_revenue_at_risk`, `vw_recovery_performance` are database inspection/reporting aids. API metric definitions include adjudication denominators and historical payments; use the API for the full scorecard. SQL views are not used as a separate source of frontend KPI constants.
