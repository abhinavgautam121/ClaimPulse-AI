# Full synthetic dataset

The complete **20,000-claim dataset is committed in this directory** as [claimpulse_seed_42.zip](claimpulse_seed_42.zip). It contains the original seed-42 records and 13 CSV tables:

| Table         |                    Records |
| ------------- | -------------------------: |
| claims        |                     20,000 |
| claim_lines   |                     20,000 |
| patients      | 5,000 synthetic references |
| providers     |                         10 |
| payers        |                          8 |
| procedures    |                          5 |
| diagnoses     |                          5 |
| denials       |                      2,152 |
| payments      |                     14,255 |
| appeals       |                      1,085 |
| underpayments |                      1,982 |
| claim_events  |                     20,450 |
| data_sources  |    1 (Synthetic Simulator) |

[claims_preview.csv](claims_preview.csv) provides 100 browsable example claims. [manifest.json](manifest.json) records the seed, date anchor, row counts, per-table checksums and archive SHA-256. All references, outcomes and contract assumptions are synthetic. User accounts, passwords, notes, audit logs and claims added during browser testing are excluded.

The snapshot dates are anchored to **2026-11-13**. Currency is USD. Expected insurer reimbursement uses a clearly labelled synthetic 72% contract assumption. Patients contain SYN- references and no clinical identity fields.

Verify the complete archive from the repository root without installing dependencies:

```bash
python scripts/verify_synthetic_data.py
```

The verifier checks every CSV checksum and count, foreign keys, unique claims, synthetic markers, dates, payment reconciliation, financial balances, denial records and successful recovery histories.

For offline analysis:

```python
import pandas as pd
from zipfile import ZipFile

with ZipFile('data/synthetic/claimpulse_seed_42.zip') as archive:
    claims = pd.read_csv(archive.open('claims.csv'))
    payments = pd.read_csv(archive.open('payments.csv'))
```

Normal app startup regenerates the database through `backend/app/services/seed.py` using seed 42. Set `SEED_COUNT` before first boot; existing populated databases are preserved. The browser CSV uploader supports 10,000 rows per job, so split the full claims CSV into two batches when using that interface. Existing claim IDs are reported as duplicates rather than overwritten.
