import pytest
from pydantic import ValidationError
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.core.database import build_engine_options, normalize_database_url


def test_supabase_postgres_url_uses_psycopg2_and_ssl() -> None:
    url = normalize_database_url(
        "postgres://postgres.example:secret@aws-0-region.pooler.supabase.com:5432/postgres"
    )

    assert url == (
        "postgresql+psycopg2://postgres.example:secret@"
        "aws-0-region.pooler.supabase.com:5432/postgres?sslmode=require"
    )


def test_existing_ssl_mode_is_preserved() -> None:
    url = normalize_database_url(
        "postgresql://postgres:secret@db.example.supabase.co:5432/postgres"
        "?sslmode=verify-full"
    )

    assert url.endswith("?sslmode=verify-full")


def test_supabase_direct_url_also_requires_ssl() -> None:
    url = normalize_database_url(
        "postgresql://postgres:secret@db.example.supabase.co:5432/postgres"
    )

    assert url.endswith("?sslmode=require")


def test_transaction_pooler_disables_client_side_pooling() -> None:
    options = build_engine_options(
        "postgresql://postgres.example:secret@aws-0-region.pooler.supabase.com:6543/postgres"
    )

    assert options["poolclass"] is NullPool


def test_sqlite_test_database_retains_thread_compatibility() -> None:
    options = build_engine_options("sqlite:///./test.db")

    assert options["connect_args"] == {"check_same_thread": False}


def test_database_configuration_requires_supabase_or_explicit_test_url(monkeypatch) -> None:
    monkeypatch.delenv("SUPABASE_DATABASE_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
