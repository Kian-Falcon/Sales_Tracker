import logging
from time import perf_counter
from typing import Any


def log_endpoint_timing(
    logger: logging.Logger,
    endpoint: str,
    started_at: float,
    *,
    status: str,
    **fields: Any,
) -> None:
    duration_ms = (perf_counter() - started_at) * 1000
    parts = [
        f"endpoint={endpoint}",
        f"status={status}",
        f"duration_ms={duration_ms:.1f}",
    ]

    for key, value in fields.items():
        if value is None:
            continue
        parts.append(f"{key}={value}")

    logger.info(" ".join(parts))
