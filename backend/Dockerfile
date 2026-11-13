# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 SOURCE_ROOT=/app/source
WORKDIR /app/backend
# Keep installation and copying in one filesystem layer for constrained VFS builders.
RUN --mount=type=bind,target=/source --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then export PIP_CERT=/run/secrets/proxy_ca; fi; \
    pip install --no-cache-dir -r /source/backend/requirements.txt && \
    useradd --uid 10001 --create-home appuser && \
    mkdir -p /app/backend/artifacts /app/source && \
    cp -R /source/backend/. /app/backend/ && \
    cp -R /source/. /app/source/ && \
    chown -R appuser:appuser /app
USER appuser
EXPOSE 8000
CMD ["sh","-c","alembic upgrade head && python -m app.services.bootstrap && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
