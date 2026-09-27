import os

from pydantic import AliasChoices, Field, model_validator
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

    DATABASE_URL: str = Field(
        validation_alias=AliasChoices("DATABASE_URL", "SUPABASE_DATABASE_URL"),
    )
    PUBLIC_APP_URL: str = os.getenv("PUBLIC_APP_URL", "http://localhost:3000")
    INVOICE_BANK_NAME: str = os.getenv("INVOICE_BANK_NAME", "")
    INVOICE_BANK_ACCOUNT_NAME: str = os.getenv("INVOICE_BANK_ACCOUNT_NAME", "")
    INVOICE_BANK_SWIFT: str = os.getenv("INVOICE_BANK_SWIFT", "")
    CORS_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

    # Invariant enforcement
    INVARIANT_INVOICE_FINAL_PACKING_ONLY: bool = True
    INVARIANT_RECEIPT_AFTER_PAYMENT_ONLY: bool = True

    @model_validator(mode="after")
    def reject_development_secrets_outside_development(self):
        bank_values = (
            self.INVOICE_BANK_NAME.strip(),
            self.INVOICE_BANK_ACCOUNT_NAME.strip(),
            self.INVOICE_BANK_SWIFT.strip(),
        )
        if any(bank_values) and not all(bank_values):
            raise ValueError(
                "Invoice bank settings must provide bank name, account name, and SWIFT together"
            )
        if self.ENVIRONMENT.lower() not in {"development", "test"}:
            if (
                self.SECRET_KEY == "local-development-key-change-before-deploying"
                or len(self.SECRET_KEY) < 32
            ):
                raise ValueError(
                    "Production requires a unique SECRET_KEY with at least 32 characters"
                )
            if not self.PUBLIC_APP_URL.startswith("https://"):
                raise ValueError("Production PUBLIC_APP_URL must use HTTPS")
        return self


settings = Settings()
