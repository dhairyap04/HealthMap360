from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import get_db

router = APIRouter(tags=["health"])


@router.get("/health")
def health_check(db: Session = Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        db.execute(text("SELECT token_version FROM users LIMIT 1"))
        db.execute(text("SELECT id FROM imports LIMIT 1"))
        db.execute(text("SELECT reporting_period_days,quality_status,version FROM cases LIMIT 1"))
        db.execute(text("SELECT id FROM feeds LIMIT 1"))
        db.execute(text("SELECT id FROM publications LIMIT 1"))
        db.execute(text("SELECT mfa_last_step FROM users LIMIT 1"))
        db.execute(text("SELECT last_tick_at FROM worker_heartbeat LIMIT 1"))
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable or migrations not applied") from None
    return {"status": "ok", "database": "ok"}
