"""Administrative commands. Run from backend: python -m app.manage --help."""

import argparse
import getpass

from sqlalchemy import select

from app.auth.security import get_password_hash
from app.db.session import SessionLocal
from app.models.models import User
from app.schemas.auth import UserCreate


def main():
    parser = argparse.ArgumentParser(description="Create or promote a HealthMap360 administrator")
    parser.add_argument("command", choices=["create-admin"])
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    args = parser.parse_args()
    data = UserCreate(username=args.username, email=args.email, password=getpass.getpass("Password (10+ characters): "))
    if getpass.getpass("Confirm password: ") != data.password:
        parser.error("Passwords do not match")
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == data.username))
        if user:
            if user.email != data.email:
                parser.error("Email does not match this account")
            user.hashed_password = get_password_hash(data.password)
            user.role = "admin"
            user.token_version += 1
        else:
            db.add(
                User(
                    username=data.username,
                    email=data.email,
                    hashed_password=get_password_hash(data.password),
                    role="admin",
                )
            )
        db.commit()
    print(f"Administrator {data.username} is ready. Sign in through the application.")


if __name__ == "__main__":
    main()
