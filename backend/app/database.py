from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from sqlalchemy.pool import NullPool
import os
from app.config import settings

def _resolve_database_url() -> str:
    database_url = settings.DATABASE_URL
    # Vercel file system is read-only except /tmp. If sqlite is used without an
    # external DB URL, move it to /tmp to prevent write failures on auth upserts.
    if os.getenv("VERCEL") and database_url.startswith("sqlite"):
        return "sqlite:////tmp/mathlearning.db"
    return database_url


DATABASE_URL = _resolve_database_url()

# Create database engine
# SQLite requires connect_args for thread safety
# Vercel serverless requires NullPool to avoid connection exhaustion
_is_vercel = bool(os.getenv("VERCEL"))
_is_sqlite = DATABASE_URL.startswith("sqlite")
connect_args = {"check_same_thread": False} if _is_sqlite else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
    echo=settings.DEBUG,
    # NullPool: don't persist connections between serverless invocations
    **({"poolclass": NullPool} if _is_vercel and not _is_sqlite else {}),
)

# Create session local class
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Create base class for models (SQLAlchemy 2.0+ style)
class Base(DeclarativeBase):
    pass


# Dependency to get database session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
