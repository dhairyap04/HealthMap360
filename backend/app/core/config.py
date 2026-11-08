import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url

ROOT = Path(__file__).resolve().parents[3]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT / ".env", extra="ignore")
    app_name: str = "HealthMap360"
    environment: str = "development"
    database_url: str = "sqlite:///./healthmap360.db"
    database_password: str | None = None
    cors_origins: list[str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    secret_key: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 12
    require_admin_mfa: bool = False
    auth_attempt_limit: int = 20
    geocoding_url: str = "https://nominatim.openstreetmap.org/search"
    geocoding_user_agent: str = "HealthMap360/0.1 (interactive public health location search)"
    max_upload_bytes: int = 50 * 1024 * 1024
    max_import_rows: int = 10000

    @model_validator(mode="after")
    def validate_security(self):
        if self.environment == "production":
            self.require_admin_mfa = True
        if self.jwt_algorithm != "HS256":
            raise ValueError("Only HS256 is supported")
        if self.environment == "production" and (len(self.secret_key) < 32 or self.secret_key == "changeme-in-env"):
            raise ValueError("Production requires a random SECRET_KEY of at least 32 characters")
        if not self.secret_key or self.secret_key == "changeme-in-env":
            self.secret_key = secrets.token_urlsafe(48)
        if self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+psycopg://", 1)
        if self.database_password is not None:
            self.database_url = (
                make_url(self.database_url).set(password=self.database_password).render_as_string(hide_password=False)
            )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
