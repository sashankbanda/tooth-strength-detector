from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from backend.config import DATABASE_URL


class Base(DeclarativeBase):
    pass


def _normalize_database_url(raw_url: str) -> str:
    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)
    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return raw_url


normalized_url = _normalize_database_url(DATABASE_URL)
engine_kwargs = {"pool_pre_ping": True}
if normalized_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(normalized_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    # Import here so model metadata is registered before create_all().
    from backend import models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    
    # Simple migration for Render PSQL to add columns if missing
    with engine.begin() as conn:
        from sqlalchemy import text
        import logging
        
        migrations = [
            "ALTER TABLE analysis_sessions ADD COLUMN total_images INTEGER DEFAULT 0 NOT NULL;",
            "ALTER TABLE analysis_sessions ADD COLUMN total_teeth INTEGER DEFAULT 0 NOT NULL;",
            "ALTER TABLE analysis_sessions ADD COLUMN processing_time_ms INTEGER;",
            "ALTER TABLE analysis_sessions ADD COLUMN csv_url VARCHAR(1024);",
            "ALTER TABLE analysis_sessions ADD COLUMN pdf_url VARCHAR(1024);"
        ]
        
        for sql in migrations:
            try:
                conn.execute(text(sql))
            except Exception as e:
                # Expected if column already exists
                logging.debug("Migration skip/fail (likely column exists): %s", e)
