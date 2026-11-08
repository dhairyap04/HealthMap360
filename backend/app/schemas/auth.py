from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


class UserLogin(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=1, max_length=128)
    otp: str = Field(default="", max_length=6)

    @field_validator("username", mode="before")
    @classmethod
    def normalize_username(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class UserCreate(UserLogin):
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)

    @field_validator("username")
    @classmethod
    def valid_username(cls, value):
        if not value.isascii() or not all(c.isalnum() or c in "_-" for c in value):
            raise ValueError("Use letters, numbers, underscores or hyphens")
        return value

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value):
        return value.lower()


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    username: str
    email: str
    role: Literal["public", "analyst", "admin"]
    mfa_enabled: bool
    mfa_required: bool


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class RoleUpdate(BaseModel):
    role: Literal["public", "analyst", "admin"]


class PasswordUpdate(BaseModel):
    otp: str = Field(default="", max_length=6)
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)
