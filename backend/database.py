from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import HTTPException, Request, status


async def create_pool(database_url: str | None) -> asyncpg.Pool | None:
    if not database_url:
        return None

    return await asyncpg.create_pool(
        database_url,
        min_size=1,
        max_size=5,
        # Supabase's transaction pooler does not support asyncpg prepared
        # statement caching, so disable it for pooled connections.
        statement_cache_size=0,
    )


async def close_pool(pool: asyncpg.Pool | None) -> None:
    if pool is not None:
        await pool.close()


async def get_pool(request: Request) -> asyncpg.Pool:
    pool = getattr(request.app.state, "db_pool", None)
    if pool is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database is not configured. Set DATABASE_URL before using the API.",
        )
    return pool


async def set_audit_actor(connection: asyncpg.Connection, user_id: UUID | str | None) -> None:
    if user_id is None:
        return

    await connection.execute("SELECT set_config('app.current_user_id', $1, true)", str(user_id))


@asynccontextmanager
async def transaction(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    async with pool.acquire() as connection:
        async with connection.transaction():
            yield connection


def record_to_dict(record: asyncpg.Record | None) -> dict[str, Any] | None:
    return dict(record) if record is not None else None


def records_to_dicts(records: list[asyncpg.Record]) -> list[dict[str, Any]]:
    return [dict(record) for record in records]
