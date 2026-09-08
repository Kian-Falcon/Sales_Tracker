import asyncio

import pytest

from database import transaction


def run_async(coro):
    return asyncio.run(coro)


class FakeTransactionHandle:
    def __init__(self, connection) -> None:
        self.connection = connection
        self.started = 0
        self.committed = 0
        self.rolled_back = 0

    async def start(self) -> None:
        self.started += 1
        if self.connection.fail_on_start:
            raise OSError(121, "The semaphore timeout period has expired")

    async def commit(self) -> None:
        self.committed += 1

    async def rollback(self) -> None:
        self.rolled_back += 1


class FakeConnection:
    def __init__(self, name: str, *, fail_on_start: bool = False) -> None:
        self.name = name
        self.fail_on_start = fail_on_start
        self.terminated = False
        self.transaction_handle = FakeTransactionHandle(self)

    def transaction(self) -> FakeTransactionHandle:
        return self.transaction_handle

    def terminate(self) -> None:
        self.terminated = True


class FakePool:
    def __init__(self, connections: list[FakeConnection]) -> None:
        self.connections = list(connections)
        self.acquire_calls = 0
        self.release_calls: list[str] = []
        self.expire_calls = 0

    async def acquire(self) -> FakeConnection:
        connection = self.connections[self.acquire_calls]
        self.acquire_calls += 1
        return connection

    async def release(self, connection: FakeConnection) -> None:
        self.release_calls.append(connection.name)

    async def expire_connections(self) -> None:
        self.expire_calls += 1


def test_transaction_retries_once_when_connection_drops_before_begin() -> None:
    first = FakeConnection("first", fail_on_start=True)
    second = FakeConnection("second")
    pool = FakePool([first, second])

    async def scenario() -> None:
        async with transaction(pool) as connection:
            assert connection.name == "second"

    run_async(scenario())

    assert pool.acquire_calls == 2
    assert pool.expire_calls == 1
    assert pool.release_calls == ["first", "second"]
    assert first.terminated is True
    assert second.transaction_handle.committed == 1
    assert second.transaction_handle.rolled_back == 0


def test_transaction_does_not_retry_after_work_has_started() -> None:
    connection = FakeConnection("primary")
    pool = FakePool([connection])

    async def scenario() -> None:
        async with transaction(pool):
            raise ConnectionError("request body failed after transaction start")

    with pytest.raises(ConnectionError, match="request body failed"):
        run_async(scenario())

    assert pool.acquire_calls == 1
    assert pool.expire_calls == 0
    assert pool.release_calls == ["primary"]
    assert connection.terminated is False
    assert connection.transaction_handle.committed == 0
    assert connection.transaction_handle.rolled_back == 1
