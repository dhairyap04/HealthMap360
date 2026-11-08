"""Offline recovery after operator identity verification. Never emails tokens."""

import argparse

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.models import User
from app.services.account_security import issue_recovery


def main():
    parser = argparse.ArgumentParser(
        description="Identity-verified account recovery; run on the trusted application host"
    )
    parser.add_argument("command", choices=["issue-recovery", "reset-mfa"])
    parser.add_argument("--username", required=True)
    parser.add_argument("--identity-verified", action="store_true", required=True)
    args = parser.parse_args()
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.username == args.username.strip().lower()))
        if not user:
            parser.error("Account not found")
        if args.command == "issue-recovery":
            print("Single-use recovery token (expires in 30 minutes; deliver through your verified channel):")
            print(issue_recovery(db, user))
        else:
            if input("Type the verified account username to revoke MFA and all sessions: ") != user.username:
                parser.error("Confirmation did not match")
            user.mfa_secret = None
            user.mfa_pending = None
            user.mfa_last_step = -1
            user.token_version += 1
            db.commit()
            print("Authenticator reset; all sessions revoked. Production administrators must enroll again.")


if __name__ == "__main__":
    main()
