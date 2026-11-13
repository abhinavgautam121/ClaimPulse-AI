# API reference

Interactive OpenAPI: `http://localhost:8000/api/docs` (also proxied at frontend `/api/docs`). Schema: `/api/openapi.json`. All operational routes require the HttpOnly JWT session, except health/auth configuration/login/register and signed webhook. A Bearer JWT is also supported for authorised API clients; use the cookie session from login rather than exposing tokens in URLs. WebSockets require the session cookie and a permitted Origin.

| Method | Path | Behaviour |
|---|---|---|
| GET | /api/health | PostgreSQL health check |
| GET/POST | /api/auth/config, /api/auth/demo | Demo capability / synthetic admin login when explicitly enabled |
| POST | /api/auth/register, /api/auth/login, /api/auth/logout | Analyst registration, login, token-version revocation |
| GET | /api/auth/me, /api/auth/users | Current profile / active workspace assignees |
| GET/POST | /api/claims | Search/filter/sort/page / validate and create claim |
| GET/PATCH | /api/claims/{id} | Financial/history drill-down / validated lifecycle or review edit |
| POST | /api/claims/{id}/notes | Add team note |
| PUT | /api/claims/{id}/assignment | Assign user, priority override, recovery state and follow-up action |
| GET | /api/analytics/dashboard, /denials, /revenue-risk, /worklist, /payers, /underpayments | Shared calculations by submission cohort |
| GET/POST | /api/ml/status, /api/ml/train | Model report / train and compare (admin only) |
| POST | /api/ml/predict/{id} | Experimental denial estimate with local sensitivity and review actions |
| POST | /api/copilot | Approved analytical intent with evidence, period and claim links |
| GET/POST | /api/simulator | State / start, pause or stop (admin control) |
| GET | /api/activity, /api/data-sources | Persisted event history / freshness and adapter status |
| POST | /api/ingestion/csv | Multipart `file`, max 10 MB, per-row validation |
| POST | /api/ingestion/rest | JSON `{ "records": [...] }`, max 10,000 rows |
| POST | /api/ingestion/webhook | Same batch with timestamp and HMAC; disabled without key |
| POST | /api/ingestion/fhir | Opt-in authorised synthetic FHIR sync (admin) |
| POST | /api/reference-sync/cms, /api/reference-sync/nppes | Public reference metadata only (admin); NPPES supports skip pagination |
| GET | /api/ingestion/template, /api/ingestion/{job}/errors | CSV template / downloadable validation report |
| GET | /api/data-quality | All-job totals and most recent 100 jobs |
| GET | /api/exports/{kind} | Claims, denials, payers, revenue-risk, aging, recovery or underpayments CSV |
| GET | /api/notifications | Prioritised history with per-user read flag |
| POST | /api/notifications/read, /api/notifications/refresh | Mark read / evaluate current thresholds and patterns |
| PUT | /api/settings | Validated personal thresholds and appearance |
| GET | /api/audit-logs, /api/system | Admin audit log / safe configuration summary |
| GET | /api/source | Sanitized source ZIP, excluding secrets, models and runtime state |
| WS | /api/ws | Authenticated events; bounded client queues and 25-second heartbeat |

## Shared filters

`start` and `end`: inclusive ISO dates, default last 90 days. Analytics supports `payer_id`, `provider_id`, `specialty`, `category`. Claims also accepts `q`, `status`, `min_amount`, `max_amount`, `page`, `page_size` (max 100), `sort`, `direction`. Worklist `limit` is bounded at 1,000. Use a custom ≥180-day range to inspect all seeded A/R buckets.

## Example synthetic record

```json
{"id":"IMPORT-EXAMPLE-001","patient_id":"SYN-EXAMPLE-001","provider_id":1,"payer_id":1,"submission_date":"2026-11-13","service_date":"2026-11-12","amount":"1000.00","adjustment":"280.00","status":"Submitted","synthetic":true}
```

Dates must be valid and not future submission dates. For Paid/Recovered, payment plus adjustment must equal billed charges, and payment must be positive. Denied/Appealed/Recovered require an approved denial reason. See schemas/claims.py for all fields and transition map. Errors use HTTP 401, 403, 404, 409, 413, 422, 429 or upstream 502/503 with a safe `detail` message.

## Webhook signing

`X-CP-Timestamp` is current Unix seconds. `X-CP-Signature` is lowercase hexadecimal `HMAC-SHA256(WEBHOOK_SECRET, timestamp + "." + raw_request_bytes)`. Sign the exact bytes sent; requests older than five minutes fail. Repeated claim IDs are recorded as duplicates without overwriting existing claims. Keep signing secrets on the server and never paste real patient details into this demo.
