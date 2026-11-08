import base64
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import DUMMY_HASH, admin, create_access_token, current_user, get_password_hash, verify_password
from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import User
from app.schemas.auth import PasswordUpdate, RoleUpdate, Token, UserCreate, UserLogin, UserOut
from app.services.account_security import (
    consume_recovery,
    decrypt_secret,
    encrypt_secret,
    matching_step,
    throttle,
    verify_mfa,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=201)
def register(data: UserCreate, request: Request, db: Session = Depends(get_db)):
    throttle(db, "register", request.client.host if request.client else "unknown", 10)
    user = User(
        username=data.username, email=data.email, role="public", hashed_password=get_password_hash(data.password)
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Username or email already registered") from None
    return Token(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.post("/login", response_model=Token)
def login(data: UserLogin, request: Request, db: Session = Depends(get_db)):
    throttle(db, "login", data.username, get_settings().auth_attempt_limit)
    throttle(db, "login-ip", request.client.host if request.client else "unknown", 120)
    user = db.scalar(select(User).where(User.username == data.username))
    valid = verify_password(data.password, user.hashed_password if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Invalid username or password")
    verify_mfa(db, user, data.otp)
    db.commit()
    return Token(access_token=create_access_token(user), user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(current_user)):
    return user


@router.post("/logout", status_code=204)
def logout(user: User = Depends(current_user), db: Session = Depends(get_db)):
    db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version + 1))
    db.commit()


@router.post("/password", status_code=204)
def change_password(data: PasswordUpdate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current_password, user.hashed_password):
        raise HTTPException(400, "Current password is incorrect")
    verify_mfa(db, user, data.otp)
    user.hashed_password = get_password_hash(data.new_password)
    db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version + 1))
    db.commit()


@router.get("/users", response_model=list[UserOut], dependencies=[Depends(admin)])
def users(db: Session = Depends(get_db)):
    return db.scalars(select(User).order_by(User.username)).all()


@router.patch("/users/{user_id}", response_model=UserOut)
def update_role(user_id: int, data: RoleUpdate, actor: User = Depends(admin), db: Session = Depends(get_db)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if actor.id == user.id and data.role != "admin":
        raise HTTPException(400, "You cannot remove your own administrator role")
    user.role = data.role
    db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version + 1))
    db.commit()
    return user


class MFARequest(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(default="", max_length=6)


@router.post("/mfa/enroll")
def enroll(data: MFARequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    throttle(db, "mfa-enroll", str(user.id), 10)
    db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version))
    db.refresh(user)
    if not verify_password(data.password, user.hashed_password):
        raise HTTPException(401, "Invalid password")
    if user.mfa_secret:
        raise HTTPException(409, "Authenticator already enabled")
    secret = base64.b32encode(secrets.token_bytes(20)).decode()
    user.mfa_pending = encrypt_secret(secret)
    db.commit()
    return {
        "secret": secret,
        "note": "Add this secret to your authenticator. Enrollment expires after ten minutes. Never share this secret.",
    }


@router.post("/mfa/confirm", status_code=204)
def confirm(data: MFARequest, user: User = Depends(current_user), db: Session = Depends(get_db)):
    throttle(db, "mfa-confirm", str(user.id), 10)
    db.execute(update(User).where(User.id == user.id).values(token_version=User.token_version))
    db.refresh(user)
    if not verify_password(data.password, user.hashed_password) or not user.mfa_pending or user.mfa_secret:
        raise HTTPException(401, "Invalid enrollment")
    step = matching_step(decrypt_secret(user.mfa_pending, 600), data.code)
    if step is None:
        raise HTTPException(401, "Invalid authenticator code")
    user.mfa_secret = user.mfa_pending
    user.mfa_pending = None
    user.mfa_last_step = step
    user.token_version += 1
    db.commit()


class Recover(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    new_password: str = Field(min_length=10, max_length=128)


@router.post("/recover", status_code=204)
def recover(data: Recover, request: Request, db: Session = Depends(get_db)):
    throttle(db, "recover", request.client.host if request.client else "unknown", 20)
    user = consume_recovery(db, data.token)
    user.hashed_password = get_password_hash(data.new_password)
    user.token_version += 1
    db.commit()
