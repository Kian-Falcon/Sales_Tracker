from __future__ import annotations

from typing import Any

import asyncpg
from asyncpg import UndefinedColumnError, UndefinedTableError

from models.stage import StageTemplate
from services.stage_templates import DEFAULT_STAGE_BLUEPRINT

_DEFAULT_ROWS = [
    (
        template.stage_key,
        template.phase.value,
        template.name,
        template.responsible_dept.value,
        template.sort_order,
        True,
        template.default_due_days,
    )
    for template in DEFAULT_STAGE_BLUEPRINT
]


def _coerce_is_enabled(row: dict[str, Any]) -> bool:
    value = row.get("is_enabled", True)
    return True if value is None else bool(value)


async def _ensure_enablement_column(connection: asyncpg.Connection | asyncpg.Pool) -> bool:
    try:
        await connection.execute(
            """
            ALTER TABLE workflow_stage_settings
            ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN NOT NULL DEFAULT TRUE
            """
        )
    except UndefinedTableError:
        return False

    return True


async def _ensure_default_rows(connection: asyncpg.Connection | asyncpg.Pool) -> bool:
    if not await _ensure_enablement_column(connection):
        return False

    try:
        await connection.executemany(
            """
            INSERT INTO workflow_stage_settings (
                stage_key,
                phase,
                name,
                responsible_dept,
                sort_order,
                is_enabled,
                default_due_days
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (stage_key) DO NOTHING
            """,
            _DEFAULT_ROWS,
        )
    except (UndefinedTableError, UndefinedColumnError):
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
            is_enabled,
            default_due_days,
            updated_at
        FROM workflow_stage_settings
        ORDER BY sort_order
        """
    )
    row_dicts = [dict(row) for row in rows]

    # Older rollout attempts could leave every row disabled, which is not a valid
    # application state. Heal that once so the toggle screen starts fully enabled.
    if row_dicts and not any(_coerce_is_enabled(row) for row in row_dicts):
        await connection.execute(
            """
            UPDATE workflow_stage_settings
            SET is_enabled = TRUE,
                updated_at = NOW()
            WHERE COALESCE(is_enabled, FALSE) = FALSE
            """
        )
        rows = await connection.fetch(
            """
            SELECT
                stage_key,
                phase,
                name,
                responsible_dept,
                sort_order,
                is_enabled,
                default_due_days,
                updated_at
            FROM workflow_stage_settings
            ORDER BY sort_order
            """
        )
        row_dicts = [dict(row) for row in rows]

    for row in row_dicts:
        row["is_enabled"] = _coerce_is_enabled(row)

    return row_dicts


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
        if row.get("is_enabled", True)
    ]


async def get_due_days_by_stage_key(connection: asyncpg.Connection | asyncpg.Pool) -> dict[str, int]:
    blueprint = await load_stage_blueprint(connection)
    return {
        template.stage_key: template.default_due_days
        for template in blueprint
        if template.default_due_days is not None
    }


async def find_active_stage_keys_for_disabled_templates(
    connection: asyncpg.Connection,
    stage_keys: list[str],
) -> list[str]:
    if not stage_keys:
        return []

    rows = await connection.fetch(
        """
        SELECT DISTINCT stage_key
        FROM stages
        WHERE stage_key = ANY($1::text[])
          AND status IN ('active', 'overdue')
        ORDER BY stage_key
        """,
        stage_keys,
    )
    return [row["stage_key"] for row in rows]


async def sync_pending_stages_with_workflow_settings(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        UPDATE stages AS s
        SET phase = w.phase,
            name = w.name,
            responsible_dept = w.responsible_dept,
            sort_order = w.sort_order
        FROM workflow_stage_settings AS w
        WHERE s.stage_key = w.stage_key
        """
    )

    await connection.execute(
        """
        DELETE FROM stages AS s
        USING workflow_stage_settings AS w
        WHERE s.stage_key = w.stage_key
          AND s.status = 'pending'
          AND w.is_enabled = FALSE
        """
    )

    await connection.execute(
        """
        UPDATE stages AS s
        SET status = 'done',
            completed_at = COALESCE(s.completed_at, NOW()),
            completed_by = NULL
        FROM workflow_stage_settings AS w
        WHERE s.stage_key = w.stage_key
          AND s.status IN ('active', 'overdue')
          AND w.is_enabled = FALSE
        """
    )

    await connection.execute(
        """
        WITH project_progress AS (
            SELECT
                p.id AS project_id,
                COALESCE(
                    MAX(s.sort_order) FILTER (WHERE s.status IN ('done', 'active', 'overdue')),
                    -1
                ) AS max_started_sort_order,
                BOOL_OR(s.status IN ('active', 'overdue', 'pending')) AS has_open_stage
            FROM projects p
            LEFT JOIN stages s ON s.project_id = p.id
            WHERE p.is_archived = FALSE
            GROUP BY p.id
        ),
        missing_enabled_stages AS (
            SELECT
                progress.project_id,
                w.stage_key,
                w.phase,
                w.name,
                w.responsible_dept,
                w.sort_order
            FROM project_progress AS progress
            JOIN workflow_stage_settings AS w
              ON w.is_enabled = TRUE
             AND w.sort_order > progress.max_started_sort_order
            LEFT JOIN stages AS existing_stage
              ON existing_stage.project_id = progress.project_id
             AND existing_stage.stage_key = w.stage_key
            WHERE progress.has_open_stage = TRUE
              AND existing_stage.id IS NULL
        )
        INSERT INTO stages (
            project_id,
            stage_key,
            phase,
            name,
            responsible_dept,
            status,
            sort_order,
            due_date,
            activated_at
        )
        SELECT
            project_id,
            stage_key,
            phase,
            name,
            responsible_dept,
            'pending',
            sort_order,
            NULL,
            NULL
        FROM missing_enabled_stages
        ORDER BY project_id, sort_order
        """
    )

    await connection.execute(
        """
        WITH projects_without_live_enabled_stage AS (
            SELECT p.id AS project_id
            FROM projects AS p
            WHERE p.is_archived = FALSE
              AND EXISTS (
                  SELECT 1
                  FROM stages AS s
                  JOIN workflow_stage_settings AS w
                    ON w.stage_key = s.stage_key
                  WHERE s.project_id = p.id
                    AND w.is_enabled = TRUE
                    AND s.status = 'pending'
              )
              AND NOT EXISTS (
                  SELECT 1
                  FROM stages AS s
                  JOIN workflow_stage_settings AS w
                    ON w.stage_key = s.stage_key
                  WHERE s.project_id = p.id
                    AND w.is_enabled = TRUE
                    AND s.status IN ('active', 'overdue')
              )
        ),
        next_enabled_stage AS (
            SELECT DISTINCT ON (s.project_id)
                s.id,
                s.stage_key,
                s.project_id,
                w.default_due_days
            FROM stages AS s
            JOIN workflow_stage_settings AS w
              ON w.stage_key = s.stage_key
            JOIN projects_without_live_enabled_stage AS p
              ON p.project_id = s.project_id
            WHERE w.is_enabled = TRUE
              AND s.status = 'pending'
            ORDER BY s.project_id, s.sort_order
        )
        UPDATE stages AS s
        SET status = 'active',
            activated_at = COALESCE(s.activated_at, NOW()),
            due_date = CASE
                WHEN next_enabled_stage.default_due_days IS NULL THEN s.due_date
                ELSE CURRENT_DATE + next_enabled_stage.default_due_days
            END
        FROM next_enabled_stage
        WHERE s.id = next_enabled_stage.id
        """
    )
