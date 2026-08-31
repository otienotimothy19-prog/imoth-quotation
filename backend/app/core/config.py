import secrets
from functools import lru_cache
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "Imoth Motor Quotation System"
    ENVIRONMENT: str = "development"
    DEBUG: bool = False

    # Database
    DATABASE_URL: str = "postgresql+psycopg2://imoth:imoth@localhost:5432/imoth_quotation"

    # Auth
    SECRET_KEY: str = secrets.token_urlsafe(32)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8
    ALGORITHM: str = "HS256"

    # CORS
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # Storage
    STORAGE_BACKEND: str = "local"  # local | s3
    STORAGE_LOCAL_PATH: str = "./storage/documents"
    STORAGE_PUBLIC_BASE_URL: str = "/files"

    # SMTP / Email
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_USE_TLS: bool = True
    SMTP_FROM_EMAIL: str = "noreply@imoth.co.ke"
    SMTP_FROM_NAME: str = "Imoth Insurance Brokers"

    # Business defaults (overridable via system_settings table)
    QUOTATION_VALIDITY_DAYS: int = 30
    LEVY_RATE: float = 0.0045
    STAMP_DUTY: float = 40.0

    # Rate limiting
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_LOGIN: str = "10/minute"

    # Initial super admin bootstrap (only used by seed script)
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@imoth.co.ke"
    BOOTSTRAP_ADMIN_PASSWORD: str = "ChangeMe123!"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
