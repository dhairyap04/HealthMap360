from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    app_name: str = "HealthMap360"
    environment: str = "development"
    database_url: str = "postgresql://postgres:postgres@localhost:5432/healthmap360"
    cors_origins: list[str] = ["http://localhost:5173", "http://localhost:3000"]
    secret_key: str = "changeme-in-env"
    jwt_algorithm: str = "HS256"
    jwt_expire_hours: int = 12

    class Config:
        env_file = ".env"

@lru_cache
def get_settings() -> Settings:
    return Settings()
