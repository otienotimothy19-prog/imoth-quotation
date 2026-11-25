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
    # Agents log in once on their device and stay logged in: their token is
    # long-lived and the app silently renews it on every launch, so they are
    # only asked to log in again if they don't open the app for this long,
    # log out, or an admin disables their account (checked on every request).
    AGENT_TOKEN_EXPIRE_DAYS: int = 180
    RATE_LIMIT_SIGNUP: str = "5/minute"

    # Login one-time codes (OTP). After the password is accepted, a 6-digit
    # code is emailed to the user and must be entered to finish logging in.
    # Needs SMTP below in production; in development (no SMTP) the code is
    # written to the server log instead.
    LOGIN_OTP_ENABLED: bool = True
    LOGIN_OTP_TTL_MINUTES: int = 10
    LOGIN_OTP_MAX_ATTEMPTS: int = 5
    LOGIN_OTP_MAX_RESENDS: int = 3
    LOGIN_OTP_RESEND_COOLDOWN_SECONDS: int = 30
    RATE_LIMIT_OTP: str = "10/minute"

    # "Forgot password" links: valid for this long, single use.
    PASSWORD_RESET_TTL_MINUTES: int = 30
    RATE_LIMIT_PASSWORD_RESET: str = "5/minute"

    # Account lockout after repeated wrong passwords / codes.
    LOGIN_MAX_FAILED_ATTEMPTS: int = 5
    LOGIN_LOCKOUT_MINUTES: int = 15

    # Name of the request header the hosting platform's load balancer sets
    # to the real visitor IP (DigitalOcean App Platform: "do-connecting-ip").
    # Empty = use the direct connection address. Only set this when the app
    # is reachable *only* through that proxy, or the header can be forged.
    CLIENT_IP_HEADER: str = ""

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
    # Zoho only lets an account send as itself, so this must be the same
    # mailbox as SMTP_USERNAME (or an alias set up on it in Zoho).
    SMTP_FROM_EMAIL: str = "support@imoth.co.ke"
    SMTP_FROM_NAME: str = "Imoth Insurance Brokers"
    PUBLIC_APP_URL: str = "http://localhost:5173"

    # Business defaults (overridable via system_settings table)
    QUOTATION_VALIDITY_DAYS: int = 30
    LEVY_RATE: float = 0.0045
    STAMP_DUTY: float = 40.0

    # Rate limiting
    RATE_LIMIT_DEFAULT: str = "100/minute"
    RATE_LIMIT_LOGIN: str = "10/minute"
    # Anonymous, pre-personal-info endpoints (compare / select) -- tighter
    # than the general default since these can be hit with no identity at
    # all behind them.
    RATE_LIMIT_ANON: str = "30/minute"

    # Initial super admin bootstrap (only used by seed script)
    BOOTSTRAP_ADMIN_EMAIL: str = "admin@imoth.co.ke"
    BOOTSTRAP_ADMIN_PASSWORD: str = "ChangeMe123!"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
