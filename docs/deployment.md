# Deployment and local operation

## Requirements

Docker Engine/Desktop with Compose v2, approximately 4 GB RAM and adequate image/build disk space. The direct workflow additionally needs Python 3.12 and Node 22+. No paid API key is required. Use PostgreSQL 17 for the verified SQL view syntax. Run one backend worker (in-process WebSockets/simulation/limiter).

## Docker Compose

```bash
python scripts/configure.py
docker compose up --build -d
docker compose ps
```

Open http://localhost:3000 and choose **Enter synthetic demo**, or register an analyst account. API docs: http://localhost:8000/api/docs. Backend waits for a healthy database, applies Alembic migrations, seeds a fresh workspace and trains models when no saved model exists. Seeding never overwrites a populated database. Health endpoint: `/api/health`.

Stop services with `docker compose down`; named PostgreSQL and model volumes persist. Do not add `--volumes` unless you intentionally want to delete this disposable synthetic database. Keep generated `.env` private and outside version control.

Port variables: FRONTEND_PORT and BACKEND_PORT. Update CORS_ORIGINS to the actual frontend origin when changing frontend ports or deploying. The frontend uses a same-origin proxy to the backend; Docker builds set API_INTERNAL_URL=http://backend:8000.

## Direct development

```bash
python scripts/configure.py
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d db
python -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
cd backend
../.venv/bin/alembic upgrade head
../.venv/bin/python -m app.services.bootstrap
../.venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
```

In another terminal:

```bash
cd frontend
npm ci
npm run dev
```

Windows: use `.venv\\Scripts\\python` and the appropriate executable paths. Configure DATABASE_URL when your PostgreSQL host/user/database differs. Next.js development defaults to 3000; `preview.mjs` also accepts managed preview `--port` flags.

## Production configuration

Provision a managed PostgreSQL database and a Python service on Render/Railway or an equivalent host. Store DATABASE_URL and a fresh JWT_SECRET (≥32 characters) in the host secret manager. Use a persistent disk for ARTIFACTS_DIR or retrain at startup with the documented single-worker limitation. Set `DEMO_MODE=false`, `COOKIE_SECURE=true`, exact HTTPS `CORS_ORIGINS`, `SEED_COUNT` for your synthetic demonstration, and explicit FHIR/AI/webhook environment variables only when authorised. Do not paste keys into the UI or commit them.

Deploy the frontend to Vercel or a Node container, setting API_INTERNAL_URL to the HTTPS backend origin **at build time** so Next rewrites HTTP and WebSocket requests to the correct service. Rebuild after changing that URL. Prefer a Node reverse proxy host with verified WebSocket support; hosting/serverless providers may limit long-lived upgrades. A real distributed deployment needs shared pub/sub and background job infrastructure beyond this single-process prototype.

Run `alembic upgrade head` as a controlled release operation before accepting traffic. The included container startup does this automatically for the demo; multi-replica production releases should run migrations once. Health/readiness must verify PostgreSQL, and the frontend should not route traffic before bootstrap is complete. Use TLS termination, backups, least-privilege DB roles, secret rotation, monitoring and appropriate healthcare governance before considering any production clinical deployment. This code rejects clinical patient data and makes no HIPAA claim.

## Integration settings

- FHIR_BASE_URL: authorised HTTPS FHIR R4 base; FHIR_TOKEN: optional bearer secret. Same-host `next` pagination only, max 100 pages, timeout/retries/429 handling. Demo resources must include `urn:claimpulse:synthetic` identifier and extensions `urn:claimpulse:payer-id` / `urn:claimpulse:provider-id`; patient references must be SYN- IDs.
- WEBHOOK_SECRET: shared signing key, timestamped HMAC, 5-minute validity window. Source records deduplicate by claim ID.
- AI_PROVIDER=deterministic is the default. For optional intent classification set `AI_PROVIDER=openai-compatible`, AI_BASE_URL (ending at the API prefix, e.g. /v1), AI_MODEL and AI_API_KEY. Only the question and intent enum are sent; SQL and responses stay controlled and calculated. Failure falls back to deterministic matching.
- CMS catalog and NPPES reference sync are user-triggered and separate from claims. NPPES uses a documented organisation search and skip pagination; it is not a live payer connection. CMS availability depends on upstream access.

## Managed cloud build with session CA

The optional `docker-compose.cloud.yml` forwards the existing CODEX_PROXY_CERT as a BuildKit secret; it never copies the certificate into image layers.

```bash
docker compose -f docker-compose.yml -f docker-compose.cloud.yml build
```

If your environment supplies a combined system CA bundle instead, point CODEX_PROXY_CERT at that trusted bundle. Preserve the provided network proxy settings and TLS verification. The base Compose works without this overlay on ordinary developer machines.

## Checks

```bash
cd backend
../.venv/bin/pytest -q
cd ../frontend
npm test
npm run typecheck
npm run build
npm run start
# In a separate shell, while FastAPI and Next.js are running:
npm run test:e2e
```

Backend tests create/reuse the dedicated `claimpulse_test` database and recreate its tables. Never point tests at a production server. The base DB role needs CREATEDB, or provision the dedicated test DB beforehand. Install the official Playwright Chromium if system Chromium is absent (`npx playwright install chromium`); set CHROMIUM_PATH to an existing browser executable when needed.

## Observed release status

See `verification.md` for executed checks, measured synthetic model metrics, browser journeys, and environment-specific deployment limitations. No remote GitHub repository or external production URL is fabricated. The local Git repository is ready to push to a user-selected remote.

## GitHub release workflow

`ci.yml` verifies backend, frontend and browser flows on pushes and pull requests. `publish-images.yml` is an explicitly dispatched release workflow that builds and publishes commit-tagged backend/frontend images to GitHub Container Registry using the repository's scoped GITHUB_TOKEN. Its backend-origin input configures the frontend proxy at build time. It does not invent a production server target; configure your selected host to deploy those images, or connect the repository to a managed host's deployment integration.

## Verification in the attached executor

Both application Docker images built successfully. This executor has an 8 GB disk and uses Docker VFS; full multi-layer PostgreSQL copies exhausted it when creating all three containers. For runtime verification only, an official PostgreSQL 17 Alpine root filesystem was locally flattened with `docker export/import`, preserving and asserting its environment, entrypoint and command metadata. The three-service application then started and passed health checks. The tracked base Compose still uses `postgres:17-alpine`; no storage driver or persistent data directory was changed. A normal Docker overlay filesystem does not need that local test override.

Local Python/Next dependency caches were removed after verification to make room for container execution. Source and lock files remain intact; use the documented `pip install` / `npm ci` commands for direct development. The active app runs from the verified containers.
