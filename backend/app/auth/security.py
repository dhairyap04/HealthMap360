from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash
from pwdlib.exceptions import PwdlibError
from pwdlib.hashers.argon2 import Argon2Hasher
from pwdlib.hashers.bcrypt import BcryptHasher
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import get_db
from app.models.models import User

password_hash = PasswordHash((Argon2Hasher(), BcryptHasher()))
bearer = HTTPBearer(auto_error=False)
DUMMY_HASH = password_hash.hash("healthmap-timing-placeholder")


def get_password_hash(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    try:
        return password_hash.verify(password, hashed)
    except (ValueError, TypeError, PwdlibError):
        return False


def create_access_token(user: User) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {
            "sub": str(user.id),
            "ver": user.token_version,
            "iat": now,
            "exp": now + timedelta(hours=settings.jwt_expire_hours),
        },
        settings.secret_key,
        algorithm=settings.jwt_algorithm,
    )


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer), db: Session = Depends(get_db)):
    unauthorized = HTTPException(401, "Sign in to continue", headers={"WWW-Authenticate": "Bearer"})
    if not credentials:
        raise unauthorized
    try:
        settings = get_settings()
        payload = jwt.decode(
            credentials.credentials,
            settings.secret_key,
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "sub", "ver"]},
        )
        user = db.get(User, int(payload["sub"]))
        if not user or payload["ver"] != user.token_version:
            raise unauthorized
        return user
    except (jwt.InvalidTokenError, ValueError, TypeError):
        raise unauthorized from None


def analyst(user: User = Depends(current_user)):
    if user.mfa_required:
        raise HTTPException(403, "Administrator authenticator enrollment is required")
    if user.role not in ("analyst", "admin"):
        raise HTTPException(403, "An analyst or administrator account is required")
    return user


def admin(user: User = Depends(current_user)):
    if user.mfa_required:
        raise HTTPException(403, "Administrator authenticator enrollment is required")
    if user.role != "admin":
        raise HTTPException(403, "An administrator account is required")
    return user
