"""Bounded auth attempts, encrypted TOTP secrets and single-use recovery."""

import base64
import hashlib
import hmac
import secrets
import struct
import time
from datetime import timedelta

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException
from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert

from app.core.config import get_settings
from app.models.models import RateBucket, RecoveryToken, User
from app.services.surveillance import utcnow


def throttle(db, category, identity, limit, seconds=600):
    now = utcnow()
    bucket = int(now.timestamp()) // seconds
    digest = hashlib.sha256(f"{category}:{identity}:{bucket}".encode()).hexdigest()
    insert = sqlite_insert if db.get_bind().dialect.name == "sqlite" else pg_insert
    count = db.scalar(
        insert(RateBucket)
        .values(id=digest, count=1, expires_at=now + timedelta(seconds=seconds))
        .on_conflict_do_update(index_elements=["id"], set_={"count": RateBucket.count + 1})
        .returning(RateBucket.count)
    )
    db.execute(delete(RateBucket).where(RateBucket.expires_at < now - timedelta(seconds=seconds)))
    db.commit()  # Failed authentication must also consume the attempt.
    if count > limit:
        raise HTTPException(429, "Too many attempts. Try again later.", headers={"Retry-After": str(seconds)})


def cipher():
    key = hashlib.sha256(("healthmap360-mfa:" + get_settings().secret_key).encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def encrypt_secret(secret):
    return cipher().encrypt(secret.encode()).decode()


def decrypt_secret(secret, ttl=None):
    try:
        return cipher().decrypt(secret.encode(), ttl=ttl).decode()
    except InvalidToken:
        raise HTTPException(
            401, "Authenticator enrollment is invalid or expired. Contact the administrator if the signing key changed."
        ) from None


def totp(secret, step):
    value = hmac.new(base64.b32decode(secret), struct.pack(">Q", step), hashlib.sha1).digest()
    offset = value[-1] & 15
    return f"{(struct.unpack('>I', value[offset : offset + 4])[0] & 0x7FFFFFFF) % 1000000:06d}"


def matching_step(secret, code):
    if not code.isascii() or len(code) != 6 or not code.isdigit():
        return None
    current = int(time.time()) // 30
    return next(
        (step for step in (current - 1, current, current + 1) if hmac.compare_digest(totp(secret, step), code)), None
    )


def verify_mfa(db, user, code):
    if not user.mfa_secret:
        return
    step = matching_step(decrypt_secret(user.mfa_secret), code)
    if step is None:
        raise HTTPException(401, "Invalid authenticator code")
    updated = db.execute(update(User).where(User.id == user.id, User.mfa_last_step < step).values(mfa_last_step=step))
    if updated.rowcount != 1:
        raise HTTPException(401, "Authenticator code was already used. Wait for the next code.")


def issue_recovery(db, user):
    token = secrets.token_urlsafe(32)
    db.execute(delete(RecoveryToken).where(RecoveryToken.user_id == user.id))
    db.add(
        RecoveryToken(
            digest=hashlib.sha256(token.encode()).hexdigest(),
            user_id=user.id,
            expires_at=utcnow() + timedelta(minutes=30),
            used=False,
        )
    )
    db.commit()
    return token


def consume_recovery(db, token):
    digest = hashlib.sha256(token.encode()).hexdigest()
    row = db.scalar(select(RecoveryToken).where(RecoveryToken.digest == digest))
    if not row:
        raise HTTPException(400, "Recovery token is invalid or expired")
    result = db.execute(
        update(RecoveryToken)
        .where(RecoveryToken.digest == digest, RecoveryToken.used.is_(False), RecoveryToken.expires_at > utcnow())
        .values(used=True)
        .execution_options(synchronize_session=False)
    )
    if result.rowcount != 1:
        raise HTTPException(400, "Recovery token is invalid or expired")
    return db.get(User, row.user_id)
