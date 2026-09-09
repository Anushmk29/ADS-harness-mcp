import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    PROJECT_NAME: str = "Fresh Produce AI Order-to-Cash Platform"
    API_V3_STR: str = "/api/v3"
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "local-development-key-change-before-deploying")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 8  # 8 hours

    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./fresh_produce_dev.db",
    )
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    # Invariant enforcement
    INVARIANT_INVOICE_FINAL_PACKING_ONLY: bool = True
    INVARIANT_RECEIPT_AFTER_PAYMENT_ONLY: bool = True


settings = Settings()
