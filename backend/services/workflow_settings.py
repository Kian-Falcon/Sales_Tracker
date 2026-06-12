from __future__ import annotations

from typing import Any

import asyncpg
from asyncpg import UndefinedTableError

from models.stage import StageTemplate
from services.stage_templates import DEFAULT_STAGE_BLUEPRINT

_DEFAULT_ROWS = [
    (
        template.stage_key,
        template.phase.value,
        template.name,
        template.responsible_dept.value,
        template.sort_order,
        template.default_due_days,
    )
    for template in DEFAULT_STAGE_BLUEPRINT
]


async def _ensure_default_rows(connection: asyncpg.Connection | asyncpg.Pool) -> bool:
    try:
        await connection.executemany(
            """
            INSERT INTO workflow_stage_settings (
                stage_key,
                phase,
                name,
                responsible_dept,
                sort_order,
                default_due_days
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (stage_key) DO NOTHING
            """,
            _DEFAULT_ROWS,
        )
    except UndefinedTableError:
        return False

    return True


async def fetch_workflow_settings_rows(
    connection: asyncpg.Connection | asyncpg.Pool,
) -> list[dict[str, Any]]:
    if not await _ensure_default_rows(connection):
        return []

    rows = await connection.fetch(
        """
        SELECT
            stage_key,
            phase,
            name,
            responsible_dept,
            sort_order,
            default_due_days,
            updated_at
        FROM workflow_stage_settings
        ORDER BY sort_order
        """
    )
    return [dict(row) for row in rows]


async def load_stage_blueprint(connection: asyncpg.Connection | asyncpg.Pool) -> list[StageTemplate]:
    rows = await fetch_workflow_settings_rows(connection)
    if not rows:
        return DEFAULT_STAGE_BLUEPRINT

    return [
        StageTemplate(
            stage_key=row["stage_key"],
            phase=row["phase"],
            name=row["name"],
            responsible_dept=row["responsible_dept"],
            sort_order=row["sort_order"],
            default_due_days=row["default_due_days"],
        )
        for row in rows
    ]


async def get_due_days_by_stage_key(connection: asyncpg.Connection | asyncpg.Pool) -> dict[str, int]:
    blueprint = await load_stage_blueprint(connection)
    return {
        template.stage_key: template.default_due_days
        for template in blueprint
        if template.default_due_days is not None
    }
