import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

import asyncpg
from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)
TRANSIENT_DB_ERRORS = (asyncpg.PostgresConnectionError, ConnectionError, OSError)


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
        # Recycle idle pooled connections more aggressively so transient
        # network drops are less likely to surface on the next request.
        max_inactive_connection_lifetime=60,
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


async def _expire_pool_connections(pool: asyncpg.Pool) -> None:
    try:
        await pool.expire_connections()
    except Exception:
        logger.warning("Failed to expire pooled database connections after a transient error.", exc_info=True)


async def _release_connection(pool: asyncpg.Pool, connection: asyncpg.Connection) -> None:
    try:
        await pool.release(connection)
    except Exception:
        logger.warning("Failed to release a database connection back to the pool.", exc_info=True)


async def _start_transaction_with_retry(pool: asyncpg.Pool) -> tuple[asyncpg.Connection, Any]:
    for attempt in range(2):
        connection: asyncpg.Connection | None = None
        try:
            connection = await pool.acquire()
            transaction_handle = connection.transaction()
            await transaction_handle.start()
            return connection, transaction_handle
        except TRANSIENT_DB_ERRORS:
            if connection is not None:
                try:
                    connection.terminate()
                except Exception:
                    logger.warning("Failed to terminate a broken database connection.", exc_info=True)
                await _release_connection(pool, connection)

            if attempt == 0:
                logger.warning(
                    "Transient database connection failure while starting a transaction. "
                    "Expiring pooled connections and retrying once.",
                    exc_info=True,
                )
                await _expire_pool_connections(pool)
                continue
            raise

    raise RuntimeError("Unable to start a database transaction.")


async def set_audit_actor(connection: asyncpg.Connection, user_id: UUID | str | None) -> None:
    if user_id is None:
        return

    await connection.execute("SELECT set_config('app.current_user_id', $1, true)", str(user_id))


@asynccontextmanager
async def transaction(pool: asyncpg.Pool) -> AsyncIterator[asyncpg.Connection]:
    connection, transaction_handle = await _start_transaction_with_retry(pool)
    try:
        yield connection
    except Exception:
        try:
            await transaction_handle.rollback()
        finally:
            await _release_connection(pool, connection)
        raise
    else:
        try:
            await transaction_handle.commit()
        finally:
            await _release_connection(pool, connection)


def record_to_dict(record: asyncpg.Record | None) -> dict[str, Any] | None:
    return dict(record) if record is not None else None


def records_to_dicts(records: list[asyncpg.Record]) -> list[dict[str, Any]]:
    return [dict(record) for record in records]
