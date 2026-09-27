import os
from typing import Any

from sqlalchemy import create_engine, make_url
from sqlalchemy.orm import declarative_base, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import settings


def normalize_database_url(database_url: str) -> str:
    """Return a SQLAlchemy URL suitable for Supabase or the SQLite test fallback."""
    if database_url.startswith("sqlite"):
        if (
            database_url.startswith("sqlite:///")
            and not database_url.startswith("sqlite:////")
            and ":memory:" not in database_url
        ):
            db_rel_path = database_url[len("sqlite:///") :]
            if not os.path.isabs(db_rel_path):
                backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                db_abs_path = os.path.join(backend_dir, db_rel_path).replace("\\", "/")
                return f"sqlite:///{db_abs_path}"
        return database_url

    url = make_url(database_url)
    if url.drivername in {"postgres", "postgresql"}:
        url = url.set(drivername="postgresql+psycopg2")

    if "supabase." in (url.host or "") and "sslmode" not in url.query:
        url = url.update_query_dict({"sslmode": "require"})

    return url.render_as_string(hide_password=False)


def build_engine_options(database_url: str) -> dict[str, Any]:
    """Choose safe connection settings for SQLite and Supabase pooler modes."""
    if database_url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}

    url = make_url(database_url)
    if url.port == 6543 and "supabase." in (url.host or ""):
        return {"poolclass": NullPool}

    return {"pool_size": 5, "max_overflow": 5, "pool_recycle": 300}


database_url = normalize_database_url(settings.DATABASE_URL)

engine = create_engine(
    database_url,
    echo=False,
    pool_pre_ping=True,
    **build_engine_options(database_url),
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
