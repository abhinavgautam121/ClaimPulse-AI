from datetime import datetime, timezone, timedelta
import time
import jwt
from pwdlib import PasswordHash
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import User, Role

passwords = PasswordHash.recommended()
# In-process guard; use a shared gateway limiter for multiple production replicas.
_attempts: dict[str, list[float]] = {}


def rate_limit(key: str, limit=20, window=60):
    now = time.monotonic()
    entries = [v for v in _attempts.get(key, []) if now - v < window]
    if len(entries) >= limit:
        raise HTTPException(
            429,
            "Too many requests. Please try again shortly.",
            headers={"Retry-After": str(window)},
        )
    entries.append(now)
    _attempts[key] = entries
    if len(_attempts) > 10000:
        for k in list(_attempts):
            if not _attempts[k] or now - _attempts[k][-1] > window:
                _attempts.pop(k, None)


def issue_token(user: User):
    return jwt.encode(
        {
            "sub": str(user.id),
            "ver": user.token_version,
            "exp": datetime.now(timezone.utc) + timedelta(hours=8),
            "iat": datetime.now(timezone.utc),
            "iss": "claimpulse",
            "aud": "claimpulse",
        },
        settings.jwt_secret,
        algorithm="HS256",
    )


def decode_token(token: str, db: Session):
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer="claimpulse",
            audience="claimpulse",
        )
        user = db.get(User, int(payload["sub"]))
        if not user or not user.active or payload.get("ver") != user.token_version:
            raise ValueError("revoked")
        return user
    except (jwt.PyJWTError, ValueError, KeyError):
        raise HTTPException(401, "Please sign in to continue.")


def current_user(request: Request, db: Session = Depends(get_db)):
    bearer = request.headers.get("authorization", "")
    token = (
        bearer[7:]
        if bearer.startswith("Bearer ")
        else request.cookies.get("cp_session", "")
    )
    if not token:
        raise HTTPException(401, "Please sign in to continue.")
    return decode_token(token, db)


def admin_user(user: User = Depends(current_user), db: Session = Depends(get_db)):
    if db.get(Role, user.role_id).name != "admin":
        raise HTTPException(403, "Administrator access is required.")
    return user
