# Verification log

Phase 1: architecture, modular repository and dependency manifests created. Configuration parsing passed. Subsequent gates are appended with observed results.

## Backend phases 2–9

- Schema and seed: Alembic initial migration applied to PostgreSQL 17; six SQL views verified. Seed 42 produced 20,000 claims, 14,255 payment records, 2,152 denials and 1,085 appeals. Database balance reconciliation found no overpayments.
- Authentication: Argon2 passwords, JWT expiry/revocation, protected routes, self-registration as analyst, admin-only training/simulation, same-origin checks. Integration tests passed.
- Claims: creation, duplicate IDs, transitions, payment ledger, denial/appeal/recovery history, notes and assignment tests passed.
- Analytics: known-record denial denominator, payments, partial balances, 30/31/100-day ageing boundaries and risk calculations passed. Dashboard and payer totals reconciled to PostgreSQL-derived records.
- Risk: 98/100 critical score fixture matched the sum of components; recommendation included the approaching deadline and missing documentation.
- ML: production synthetic dataset contained 15,957 adjudicated records. Chronological split: 9,393 training, 3,295 validation, 3,269 test. Logistic Regression selected by validation ROC-AUC 0.7165; held-out ROC-AUC 0.6869, precision 0.2435, recall 0.5928, F1 0.3452. Random Forest test ROC-AUC 0.6721. These are synthetic demonstration results, not measured operational improvements.
- Ingestion: CSV valid/rejected/duplicate fixture, downloadable errors, signed webhook and duplicate replay tests passed. Simulator lifecycle and authenticated WebSocket event delivery passed.
- Copilot: six analytical intents returned controlled calculated evidence; arbitrary SQL request returned unsupported intent.
- Result: 15 backend tests passed (dedicated PostgreSQL test database).

## Frontend build gate

TypeScript check passed. Three display-convention tests passed. Next.js 15.5.29 production build passed. Managed preview relay failed to become ready; local application browser verification is tracked below.

## External availability observed 2026-11-13

CMS data.json returned HTTP 403 from this environment; adapter remains opt-in and reports failures. NPPES v2.1 organisation search with an organisation-name criterion returned HTTP 200 and 10 results. FHIR R4 Claim documentation and Synthea project pages returned HTTP 200. No private insurer feed or clinical connection was configured.

## Release workflows and regression checks

- 20 backend tests passed against PostgreSQL (including recovery after Closed, draft exclusion, source archive secret exclusion, unknown-login handling, extra-field rejection and empty-note validation).
- 3 Vitest checks passed; TypeScript and Next.js production build passed.
- All 8 Playwright journeys passed against the running Next.js + FastAPI + PostgreSQL app: all workspace routes, full claim creation/payment/assignment/note lifecycle, CSV validation/error download, Copilot evidence/unsupported SQL intent, simulator start/pause/stop, export/date controls, 390px mobile layout, registration/analyst access. No page JavaScript errors during route traversal.
- Visual captures: login, executive dashboard, claims, denial analysis, claim detail, prediction, Copilot, ingestion and mobile dashboard (9 PNG files). No horizontal overflow at 390px.
- CMS adapter verification returned 502 to the UI for the upstream 403, persisted a failed job and marked source error without fabricating freshness. NPPES adapter returned 10 public organisation references and persisted successful sync time. These are references only.
- Backend Docker image built successfully. The environment uses Docker VFS and an 8 GB disk; earlier full-layer dependency copies exhausted disk. Dockerfiles now avoid repeated dependency copies and the frontend uses a temporary memory workspace for its build. Final frontend/Compose verification is appended below when observed.

## Phase review map

| Phase | Principal files | Check and user verification |
|---|---|---|
| 1 Architecture | docs/architecture.md, manifests, project folders | Configuration parsing; inspect architecture diagram and modular directories |
| 2 Database/seed | models/entities.py, migrations/versions, services/seed.py | Alembic + PostgreSQL constraints/views; inspect 20,000 seeded claims and payment/denial relationships |
| 3 Auth/API | core/security.py, api/auth.py, app/main.py | Auth/role/CSRF tests; register, sign in/out and inspect /api/docs |
| 4 Claims | schemas/claims.py, services/claims.py, api/claims.py, frontend/app/claims | Creation/transition/payment tests and Playwright full lifecycle |
| 5 Analytics | analytics/metrics.py, api/analytics.py, frontend analytics components | Known-record formulas, dashboard/payer reconciliation; change dates and export |
| 6 Risk/worklist | metrics risk_components/worklist, claim detail | Exact component fixture; assign, override priority, add note/action |
| 7 ML | ml/engine.py, prediction page, notebooks | Chronological split/model metrics/inference tests; train and request a claim estimate |
| 8 Real-time/ETL | ingestion, websocket/hub.py, services/simulator.py | CSV/webhook/simulator/WebSocket tests; start/pause/stop and download errors |
| 9 Copilot | services/copilot.py, intelligence page | Six intents/evidence tests; ask an approved question and inspect supporting records |
| 10 Release | Dockerfiles, compose files, tests, CI | 20 backend + 3 unit + 8 browser tests, TypeScript and production build; health checks |
| 11 Documentation | README, docs, data, notebooks, screenshots | Repository inspection, nine screenshots, source ZIP and setup/deployment instructions |

Run commands are in docs/deployment.md; README and technical documents have been updated throughout the implementation. Repository commits separate setup, backend/data and the finished interface/release package.

Additional leakage guard: submission authorisation/documentation/eligibility inputs are locked after adjudication; a regression test verified updates before the outcome and rejection after payment. Original amount can change only while Draft. This keeps training inputs from being corrected retrospectively after a known outcome.

## Container release verification

- Backend and frontend Docker builds completed successfully with the supplied CA passed only through BuildKit secrets.
- The attached Docker VFS executor required local compaction of the official PostgreSQL 17 Alpine image to fit all runtime copies on its 8 GB disk. Export/import preserved and asserted ENV, ENTRYPOINT and CMD metadata. Base Compose remains unchanged and references the standard official image. No storage driver or Docker data-directory change was made.
- All three Compose services reached healthy state: PostgreSQL, FastAPI on 127.0.0.1:8000, Next.js on port 3000.
- Container bootstrap applied migrations, loaded 20,000 synthetic claims and trained Logistic Regression with held-out ROC-AUC 0.6869. Health, authenticated claims, model report and source download returned successful responses through the frontend proxy.
- SQL view outstanding balances exactly reconciled to the central analytics calculation.

- Final container browser run: all 8 Playwright journeys passed in 50.5 seconds, including authenticated WebSocket updates through the production Next.js proxy.
- A fresh source checkout (without generated .next files) passed TypeScript checking.
- Final source formatting used Black (including its AST equivalence check) and Prettier; no application behaviour changed after verification. Python syntax parsing and Git whitespace checks passed.
- Final source package is available through Reports → Download source. It excludes .env, runtime model binaries, databases, dependency folders and Git internals.
