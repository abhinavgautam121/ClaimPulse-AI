import asyncio, logging
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, WebSocket, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from sqlalchemy import text
from app.core.database import SessionLocal
from app.core.config import settings
from app.core.security import decode_token, rate_limit
from app.api import auth, claims, analytics, workspace
from app.services.simulator import simulator, polling_worker
from app.websocket.hub import hub

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app):
    poll = asyncio.create_task(polling_worker())
    yield
    poll.cancel()
    if simulator.task:
        simulator.task.cancel()


app = FastAPI(
    title="ClaimPulse AI API",
    version="1.0.0",
    description="Independent synthetic healthcare RCM portfolio platform. No clinical or coverage decisions.",
    lifespan=lifespan,
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "X-CP-Timestamp", "X-CP-Signature"],
)


@app.middleware("http")
async def protections(request: Request, call_next):
    try:
        rate_limit("api:" + request.client.host, 1200, 60)
        origin = request.headers.get("origin")
        if (
            request.method not in ["GET", "HEAD", "OPTIONS"]
            and origin
            and origin not in settings.cors_origins
        ):
            raise HTTPException(403, "Request origin is not permitted.")
        response = await call_next(request)
    except HTTPException as exc:
        response = JSONResponse(
            {"detail": exc.detail}, status_code=exc.status_code, headers=exc.headers
        )
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-store"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "detail": "; ".join(
                ".".join(map(str, e["loc"])) + ": " + e["msg"] for e in exc.errors()
            )
        },
    )


for router in [auth.router, claims.router, analytics.router, workspace.router]:
    app.include_router(router, prefix="/api")


@app.get("/api/health", tags=["System"])
def health():
    with SessionLocal() as db:
        db.execute(text("SELECT 1"))
    return {"status": "ok", "database": "PostgreSQL", "version": "1.0.0"}


@app.websocket("/api/ws")
async def websocket(ws: WebSocket):
    origin = ws.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        await ws.close(code=1008)
        return
    try:
        with SessionLocal() as db:
            decode_token(ws.cookies.get("cp_session", ""), db)
        await hub.serve(ws)
    except Exception:
        try:
            await ws.close(code=1008)
        except RuntimeError:
            pass
