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
    except SQLAlchemyError:
        raise HTTPException(503, "Database unavailable or migrations not applied") from None
    return {"status": "ok", "database": "ok"}
