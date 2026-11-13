from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.database import get_db
from app.core.config import settings
from app.core.security import (
    current_user,
    admin_user,
    passwords,
    issue_token,
    rate_limit,
)
from app.models.entities import User, Role, AuditLog
from app.schemas.claims import Registration, Login

router = APIRouter(prefix="/auth", tags=["Authentication"])


def public_user(db, user):
    return {
        "id": user.id,
        "name": user.name,
        "email": user.email,
        "role": db.get(Role, user.role_id).name,
        "preferences": user.preferences,
    }


def session_response(db, user, response):
    response.set_cookie(
        "cp_session",
        issue_token(user),
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=8 * 3600,
        path="/",
    )
    return public_user(db, user)


@router.post("/register", status_code=201)
def register(
    data: Registration,
    response: Response,
    request: Request,
    db: Session = Depends(get_db),
):
    rate_limit("register:" + request.client.host, 10, 600)
    if db.scalar(select(User.id).where(User.email == str(data.email).lower())):
        raise HTTPException(409, "This email is already registered.")
    user = User(
        email=str(data.email).lower(),
        name=data.name.strip(),
        role_id=2,
        password_hash=passwords.hash(data.password),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "This email is already registered.")
    db.add(AuditLog(user_id=user.id, action="register", entity="user"))
    db.commit()
    return session_response(db, user, response)


@router.post("/login")
def login(
    data: Login, response: Response, request: Request, db: Session = Depends(get_db)
):
    rate_limit("login:" + request.client.host, 15, 300)
    user = db.scalar(select(User).where(User.email == str(data.email).lower()))
    dummy = "$argon2id$v=19$m=65536,t=3,p=4$YWJjZGVmZ2hpamtsbW5vcA$4qHLFj59b0CbZZKIlYP1oDRg4gGT4mWWegK0XBlj7aw"
    valid = passwords.verify(data.password, user.password_hash if user else dummy)
    if not user or not valid or not user.active:
        raise HTTPException(401, "Email or password is incorrect.")
    db.add(AuditLog(user_id=user.id, action="login", entity="session"))
    db.commit()
    return session_response(db, user, response)


@router.get("/config")
def config():
    return {
        "demo_mode": settings.demo_mode,
        "data_policy": "Synthetic records only. No real patient information.",
    }


@router.post("/demo")
def demo(response: Response, request: Request, db: Session = Depends(get_db)):
    if not settings.demo_mode:
        raise HTTPException(404, "Demo access is disabled.")
    rate_limit("demo:" + request.client.host, 30, 300)
    user = db.get(User, 1)
    if not user:
        raise HTTPException(
            503, "Seed the synthetic workspace before entering the demo."
        )
    db.add(AuditLog(user_id=user.id, action="demo_login", entity="session"))
    db.commit()
    return session_response(db, user, response)


@router.get("/me")
def me(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return public_user(db, user)


@router.post("/logout")
def logout(
    response: Response,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    user.token_version += 1
    db.add(AuditLog(user_id=user.id, action="logout", entity="session"))
    db.commit()
    response.delete_cookie("cp_session", path="/")
    return {"success": True}


@router.get("/users")
def users(user: User = Depends(current_user), db: Session = Depends(get_db)):
    return [
        public_user(db, u) for u in db.scalars(select(User).where(User.active == True))
    ]
