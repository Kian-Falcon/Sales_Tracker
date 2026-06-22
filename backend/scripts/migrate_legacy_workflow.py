from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID

import asyncpg

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from models.stage import StageTemplate
from services.workflow_settings import load_stage_blueprint

SOURCE_WORKFLOW = "legacy-placeholder-27"
TARGET_WORKFLOW = "kian-falcon-25-stage-v2"
ACTIVE_STATUSES = {"active", "overdue"}

LEGACY_STAGE_ORDER = [
    "c1",
    "c2",
    "c3",
    "c4",
    "c5",
    "c6",
    "d1",
    "d2",
    "d3",
    "d4",
    "d5",
    "d6",
    "d7",
    "s1",
    "s2",
    "s3",
    "s4",
    "s5",
    "s6",
    "s7",
    "p1",
    "p2",
    "p3",
    "p4",
    "p5",
    "p6",
    "p7",
]
LEGACY_TO_TARGET = {
    "c1": "costing_sop_logged",
    "c2": "costing_shared_rd",
    "c3": "costing_revision_items",
    "c4": "costing_revision_items",
    "c5": "costing_client_approved",
    "c6": "drawing_sop_logged",
    "d1": "drawing_sop_logged",
    "d2": "drawings_prepared_rd",
    "d3": "drawings_prepared_rd",
    "d4": "drawing_revision_items",
    "d5": "drawings_client_approved",
    "d6": "sample_sop_logged",
    "d7": "sample_development_started",
    "s1": "sample_sop_logged",
    "s2": "sample_development_started",
    "s3": "sample_completed_rd",
    "s4": "sample_completed_rd",
    "s5": "samples_shared_client",
    "s6": "sample_revisions_requested",
    "s7": "sample_client_approved",
    "p1": "order_sop_logged_production",
    "p2": "raw_material_procurement_completed",
    "p3": "production_started",
    "p4": "qc_completed",
    "p5": "production_completed",
    "p6": "dispatch_completed",
    "p7": "dispatch_completed",
}

def load_env(path: Path) -> dict[str, str]:
    if not path.exists():
        raise FileNotFoundError(f"Missing env file: {path}")

    values: dict[str, str] = {}
    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip()
    return values


def to_plain(value: Any) -> Any:
    if isinstance(value, dict):
        return {key: to_plain(item) for key, item in value.items()}
    if isinstance(value, list):
        return [to_plain(item) for item in value]
    if isinstance(value, tuple):
        return [to_plain(item) for item in value]
    if isinstance(value, UUID):
        return str(value)
    if type(value).__name__ == "UUID":
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def is_legacy_project(stage_keys: list[str]) -> bool:
    return stage_keys == LEGACY_STAGE_ORDER


def pick_first(rows: list[dict[str, Any]], field: str) -> Any:
    for row in rows:
        value = row.get(field)
        if value is not None:
            return value
    return None


def pick_last(rows: list[dict[str, Any]], field: str) -> Any:
    for row in reversed(rows):
        value = row.get(field)
        if value is not None:
            return value
    return None


def build_target_index(stage_blueprint: list[StageTemplate]) -> tuple[list[str], dict[str, int]]:
    target_stage_keys = [template.stage_key for template in stage_blueprint]
    return target_stage_keys, {stage_key: index for index, stage_key in enumerate(target_stage_keys)}


def determine_progress(
    legacy_stages: list[dict[str, Any]],
    target_stage_keys: list[str],
    target_index_by_key: dict[str, int],
) -> dict[str, Any]:
    active_stage = next((stage for stage in legacy_stages if stage["status"] in ACTIVE_STATUSES), None)
    reached_indices = [
        target_index_by_key[LEGACY_TO_TARGET[stage["stage_key"]]]
        for stage in legacy_stages
        if stage["status"] == "done" or stage["status"] in ACTIVE_STATUSES
    ]
    max_reached_index = max(reached_indices, default=-1)
    legacy_done = all(stage["status"] == "done" for stage in legacy_stages)

    if active_stage is not None:
        current_target_key = LEGACY_TO_TARGET[active_stage["stage_key"]]
        current_index = target_index_by_key[current_target_key]
        current_status = active_stage["status"]
        all_done = False
    elif legacy_done and max_reached_index == len(target_stage_keys) - 1:
        current_target_key = None
        current_index = None
        current_status = None
        all_done = True
    elif max_reached_index >= 0:
        current_index = min(max_reached_index + 1, len(target_stage_keys) - 1)
        current_target_key = target_stage_keys[current_index]
        current_status = "active"
        all_done = False
    else:
        current_index = 0
        current_target_key = target_stage_keys[0]
        current_status = "active"
        all_done = False

    return {
        "active_stage": active_stage,
        "current_target_key": current_target_key,
        "current_index": current_index,
        "current_status": current_status,
        "all_done": all_done,
    }


def build_target_rows(
    project: dict[str, Any],
    legacy_stages: list[dict[str, Any]],
    stage_blueprint: list[StageTemplate],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    target_stage_keys, target_index_by_key = build_target_index(stage_blueprint)
    progress = determine_progress(legacy_stages, target_stage_keys, target_index_by_key)
    grouped_legacy: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for stage in legacy_stages:
        grouped_legacy[LEGACY_TO_TARGET[stage["stage_key"]]].append(stage)

    previous_completed_at = project["created_at"]
    target_rows: list[dict[str, Any]] = []

    for index, template in enumerate(stage_blueprint):
        legacy_group = grouped_legacy.get(template.stage_key, [])
        source_activated_at = pick_first(legacy_group, "activated_at")
        source_due_date = pick_last(legacy_group, "due_date")
        source_completed_at = pick_last(legacy_group, "completed_at")
        source_completed_by = pick_last(legacy_group, "completed_by")

        if progress["all_done"]:
            status = "done"
        elif index < progress["current_index"]:
            status = "done"
        elif index == progress["current_index"]:
            status = progress["current_status"]
        else:
            status = "pending"

        activated_at = None
        due_date = None
        completed_at = None
        completed_by = None

        if status == "done":
            activated_at = source_activated_at or previous_completed_at or project["created_at"]
            completed_at = source_completed_at or activated_at or project["created_at"]
            completed_by = source_completed_by
            due_date = source_due_date
            if due_date is None and activated_at is not None and template.default_due_days is not None:
                due_date = activated_at.date() + timedelta(days=template.default_due_days)
            previous_completed_at = completed_at or previous_completed_at
        elif status in ACTIVE_STATUSES:
            active_source = progress["active_stage"]
            if active_source is not None and LEGACY_TO_TARGET[active_source["stage_key"]] == template.stage_key:
                activated_at = active_source["activated_at"] or source_activated_at or previous_completed_at or project["created_at"]
                due_date = active_source["due_date"] or source_due_date
            else:
                activated_at = source_activated_at or previous_completed_at or project["created_at"]
                due_date = source_due_date

            if due_date is None and activated_at is not None and template.default_due_days is not None:
                due_date = activated_at.date() + timedelta(days=template.default_due_days)

        target_rows.append(
            {
                "stage_key": template.stage_key,
                "phase": template.phase.value,
                "name": template.name,
                "responsible_dept": template.responsible_dept.value,
                "status": status,
                "sort_order": template.sort_order,
                "due_date": due_date,
                "completed_at": completed_at,
                "completed_by": completed_by,
                "activated_at": activated_at,
            }
        )

    return target_rows, progress


async def ensure_backup_table(connection: asyncpg.Connection) -> None:
    await connection.execute(
        """
        CREATE TABLE IF NOT EXISTS workflow_migration_backups (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
          source_version TEXT NOT NULL,
          target_version TEXT NOT NULL,
          backup JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (project_id, source_version, target_version)
        )
        """
    )


async def fetch_legacy_projects(connection: asyncpg.Connection, project_code: str | None) -> list[dict[str, Any]]:
    rows = await connection.fetch(
        """
        SELECT
            p.id,
            p.project_code,
            p.name,
            p.client,
            p.brand,
            p.created_at,
            p.created_by,
            ARRAY_AGG(s.stage_key ORDER BY s.sort_order) AS stage_keys
        FROM projects p
        JOIN stages s ON s.project_id = p.id
        WHERE ($1::text IS NULL OR p.project_code = $1)
        GROUP BY p.id, p.project_code, p.name, p.client, p.brand, p.created_at, p.created_by
        ORDER BY p.created_at
        """,
        project_code,
    )

    projects: list[dict[str, Any]] = []
    for row in rows:
        project = dict(row)
        stage_keys = list(project["stage_keys"] or [])
        if is_legacy_project(stage_keys):
            projects.append(project)
    return projects


async def migrate_project(connection: asyncpg.Connection, project: dict[str, Any], apply_changes: bool) -> bool:
    backup_exists = await connection.fetchval(
        """
        SELECT 1
        FROM workflow_migration_backups
        WHERE project_id = $1
          AND source_version = $2
          AND target_version = $3
        """,
        project["id"],
        SOURCE_WORKFLOW,
        TARGET_WORKFLOW,
    )
    if backup_exists:
        print(f"skip {project['project_code']}: already migrated")
        return False

    legacy_stages = [dict(row) for row in await connection.fetch("SELECT * FROM stages WHERE project_id = $1 ORDER BY sort_order", project["id"])]
    stage_ids = [stage["id"] for stage in legacy_stages]
    legacy_stage_key_by_id = {stage["id"]: stage["stage_key"] for stage in legacy_stages}

    legacy_comments = [
        dict(row)
        for row in await connection.fetch(
            """
            SELECT c.*
            FROM comments c
            WHERE c.stage_id = ANY($1::uuid[])
            ORDER BY c.created_at, c.id
            """,
            stage_ids,
        )
    ]
    legacy_audits = [
        dict(row)
        for row in await connection.fetch(
            """
            SELECT *
            FROM audit_log
            WHERE table_name = 'stages'
              AND record_id = ANY($1::uuid[])
            ORDER BY changed_at, id
            """,
            stage_ids,
        )
    ]
    legacy_notifications = [
        dict(row)
        for row in await connection.fetch(
            """
            SELECT *
            FROM notifications_log
            WHERE stage_id = ANY($1::uuid[])
            ORDER BY created_at, id
            """,
            stage_ids,
        )
    ]

    stage_blueprint = await load_stage_blueprint(connection)
    target_rows, progress = build_target_rows(project, legacy_stages, stage_blueprint)
    target_active = progress["current_target_key"] or "completed"

    if not apply_changes:
        print(
            f"dry-run {project['project_code']}: "
            f"{len(legacy_stages)} legacy stages -> {len(target_rows)} new stages, "
            f"active target = {target_active}"
        )
        return False

    backup_payload = json.dumps(
        to_plain(
            {
                "project": project,
                "legacy_stages": legacy_stages,
                "legacy_comments": legacy_comments,
                "legacy_audits": legacy_audits,
                "legacy_notifications": legacy_notifications,
            }
        )
    )

    async with connection.transaction():
        await connection.execute(
            """
            INSERT INTO workflow_migration_backups (project_id, source_version, target_version, backup)
            VALUES ($1, $2, $3, $4::jsonb)
            """,
            project["id"],
            SOURCE_WORKFLOW,
            TARGET_WORKFLOW,
            backup_payload,
        )

        await connection.execute("ALTER TABLE comments DISABLE TRIGGER comment_lock_guard")
        try:
            await connection.execute("DELETE FROM stages WHERE project_id = $1", project["id"])

            new_stage_id_by_key: dict[str, UUID] = {}
            for stage in target_rows:
                new_stage_id = await connection.fetchval(
                    """
                    INSERT INTO stages (
                        project_id,
                        stage_key,
                        phase,
                        name,
                        responsible_dept,
                        status,
                        due_date,
                        completed_at,
                        completed_by,
                        sort_order,
                        activated_at
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                    RETURNING id
                    """,
                    project["id"],
                    stage["stage_key"],
                    stage["phase"],
                    stage["name"],
                    stage["responsible_dept"],
                    stage["status"],
                    stage["due_date"],
                    stage["completed_at"],
                    stage["completed_by"],
                    stage["sort_order"],
                    stage["activated_at"],
                )
                new_stage_id_by_key[stage["stage_key"]] = new_stage_id

            for comment in legacy_comments:
                legacy_stage_key = legacy_stage_key_by_id[comment["stage_id"]]
                target_key = LEGACY_TO_TARGET[legacy_stage_key]
                await connection.execute(
                    """
                    INSERT INTO comments (stage_id, user_id, department, text, created_at)
                    VALUES ($1, $2, $3, $4, $5)
                    """,
                    new_stage_id_by_key[target_key],
                    comment["user_id"],
                    comment["department"],
                    comment["text"],
                    comment["created_at"],
                )
        finally:
            await connection.execute("ALTER TABLE comments ENABLE TRIGGER comment_lock_guard")

    print(
        f"migrated {project['project_code']}: "
        f"{len(legacy_stages)} legacy stages -> {len(target_rows)} new stages, "
        f"active target = {target_active}"
    )
    return True


async def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate legacy placeholder workflow projects to the real 25-stage blueprint.")
    parser.add_argument("--project-code", help="Migrate only one project code.")
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply the migration. Without this flag, the script only prints what it would do.",
    )
    args = parser.parse_args()

    env = load_env(ROOT / ".env")
    connection = await asyncpg.connect(env["DATABASE_URL"], statement_cache_size=0)
    try:
        await ensure_backup_table(connection)
        projects = await fetch_legacy_projects(connection, args.project_code)
        if not projects:
            target = args.project_code or "all projects"
            print(f"no legacy projects found for {target}")
            return

        migrated_count = 0
        for project in projects:
            migrated = await migrate_project(connection, project, args.apply)
            migrated_count += int(migrated)

        if args.apply:
            print(f"finished: migrated {migrated_count} project(s)")
        else:
            print(f"finished dry-run: {len(projects)} project(s) would be migrated")
    finally:
        await connection.close()


if __name__ == "__main__":
    asyncio.run(main())
