from contextlib import asynccontextmanager

import asyncpg
from fastapi import FastAPI

from app.config import settings

_pool: asyncpg.Pool | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _pool
    _pool = await asyncpg.create_pool(
        settings.database_url,
        min_size=1,
        max_size=5,
        statement_cache_size=0,
    )
    try:
        yield
    finally:
        if _pool is not None:
            await _pool.close()


def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool
