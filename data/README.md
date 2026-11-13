# Synthetic dataset

Run `python -m app.services.seed` from backend after migrations. Default count: 20,000; seed: 42. `SEED_COUNT` controls count on a fresh database. Seeding an existing populated workspace is a no-op. Reset only a disposable demonstration database if you want a fresh reproducible seed; never reset an external database casually.

The generator produces 10 synthetic providers, 8 synthetic payer labels, 5,000 synthetic patient references, broad procedure and diagnosis categories, temporally plausible statuses, denials, payment ledgers, appeals, recoveries and matching lifecycle events. Outcomes depend probabilistically on pre-submission features rather than uniform random labels. Dates are relative to seeding day; reproducibility of the distributions is anchored by random seed 42. No real clinical data is included.

`synthetic/` contains generation instructions rather than a large checked-in binary dump. `samples/claims.csv` can be uploaded through the ingestion page. The app also generates a current-date template. Demo rejects future submission dates, unknown references, invalid balances, non-synthetic patient IDs and unrecognised CSV columns.

Reference sources (not individual claim feeds): [CMS](https://data.cms.gov/), [CMS Provider Data Catalog](https://data.cms.gov/provider-data/), [Synthea](https://synthetichealth.github.io/synthea/), [NPPES](https://npiregistry.cms.hhs.gov/), and [FHIR R4 Claim](https://www.hl7.org/fhir/R4/claim.html). The built-in generator is independently implemented; this repository does not bundle Synthea output or CMS claim records.
