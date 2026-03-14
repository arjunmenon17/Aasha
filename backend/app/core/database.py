from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

db_url = settings.DATABASE_URL
if db_url:
    # Ensure we use asyncpg for PostgreSQL (not psycopg2)
    if db_url.startswith("postgresql://") and not db_url.startswith("postgresql+asyncpg://"):
        db_url = db_url.replace("postgresql://", "postgresql+asyncpg://", 1)
    engine = create_async_engine(db_url, echo=False, pool_size=5, max_overflow=10)
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
else:
    # Supabase REST mode: do not fall back to local SQLite.
    engine = None
    async_session = None



class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    if async_session is None:
        raise RuntimeError(
            "DATABASE_URL is not configured. SQLAlchemy session is unavailable in Supabase-only mode."
        )
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
