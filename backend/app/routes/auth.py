from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.security import DUMMY_HASH, admin, create_access_token, current_user, get_password_hash, verify_password
from app.db.session import get_db
from app.models.models import User
from app.schemas.auth import PasswordUpdate, RoleUpdate, Token, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=Token, status_code=201)
def register(data: UserCreate, db: Session = Depends(get_db)):
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
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.scalar(select(User).where(User.username == data.username))
    valid = verify_password(data.password, user.hashed_password if user else DUMMY_HASH)
    if not user or not valid:
        raise HTTPException(401, "Invalid username or password")
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
