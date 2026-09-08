import logging
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import HTTPException

from config import Settings
from database import transaction
from models.comment import CommentRead
from models.common import ProjectDocumentType, StageStatus
from models.project import ProjectDetail
from models.stage import StageDueDateChangeRequestRead, StageRead
from models.workflow_settings import WorkflowStageSettingRead
from services.airtable import AirtableClient, AirtableServiceError, build_equals_any_formula
from services.workflow_settings import fetch_workflow_settings_rows

logger = logging.getLogger(__name__)

PROJECT_ID_FIELD = "Tracker Project Id"
STAGE_ID_FIELD = "Tracker Stage Id"
COMMENT_ID_FIELD = "Tracker Comment Id"
DUE_DATE_REQUEST_ID_FIELD = "Tracker Due Date Request Id"
WORKFLOW_STAGE_KEY_FIELD = "Stage Key"


def _iso_date(value: date | None) -> str | None:
    return value.isoformat() if value is not None else None


def _iso_datetime(value: datetime | None) -> str | None:
    if value is None:
        return None

    return value.astimezone(timezone.utc).isoformat()


def _project_url(settings: Settings, project_id: UUID) -> str | None:
    if not settings.frontend_url:
        return None

    return f"{settings.frontend_url.rstrip('/')}/projects/{project_id}"


def _current_stage(project: ProjectDetail) -> StageRead | None:
    active_statuses = {StageStatus.ACTIVE, StageStatus.OVERDUE}
    for stage in sorted(project.stages, key=lambda item: item.sort_order):
        if stage.status in active_statuses:
            return stage

    return None


def _build_project_record_fields(
    project: ProjectDetail,
    *,
    synced_at: datetime,
    project_url: str | None,
) -> dict:
    current_stage = _current_stage(project)
    completed_stages = sum(1 for stage in project.stages if stage.status == StageStatus.DONE)
    overdue_stages = sum(1 for stage in project.stages if stage.status == StageStatus.OVERDUE)
    pending_stages = sum(1 for stage in project.stages if stage.status == StageStatus.PENDING)
    has_boq = any(document.document_type == ProjectDocumentType.BOQ for document in project.documents)

    return {
        PROJECT_ID_FIELD: str(project.id),
        "Project Code": project.project_code,
        "Project Name": project.name,
        "Client": project.client,
        "Priority": project.priority.value,
        "Assigned Person": project.assigned_person_name,
        "Created By Name": project.created_by_name,
        "Created By Department": project.created_by_department.value if project.created_by_department else None,
        "Estimated TAT Days": project.estimated_tat_days,
        "Total Order Value": project.total_order_value,
        "Special Request": project.special_request,
        "Current Stage Name": current_stage.name if current_stage else None,
        "Current Stage Phase": current_stage.phase.value if current_stage else None,
        "Current Stage Department": current_stage.responsible_dept.value if current_stage else None,
        "Current Stage Status": current_stage.status.value if current_stage else None,
        "Current Stage Due Date": _iso_date(current_stage.due_date) if current_stage else None,
        "Current Stage Activated At": _iso_datetime(current_stage.activated_at) if current_stage else None,
        "Completed Stages": completed_stages,
        "Total Stages": len(project.stages),
        "Pending Stages": pending_stages,
        "Overdue Stages": overdue_stages,
        "Document Count": len(project.documents),
        "Has BOQ": has_boq,
        "Project URL": project_url,
        "Is Archived": project.is_archived,
        "Created At": _iso_datetime(project.created_at),
        "Last Synced At": _iso_datetime(synced_at),
    }


def _build_stage_record_fields(
    project: ProjectDetail,
    stage: StageRead,
    *,
    synced_at: datetime,
    project_url: str | None,
    completed_by_name: str | None,
) -> dict:
    current_stage = _current_stage(project)

    return {
        STAGE_ID_FIELD: str(stage.id),
        PROJECT_ID_FIELD: str(project.id),
        "Project Code": project.project_code,
        "Project Name": project.name,
        WORKFLOW_STAGE_KEY_FIELD: stage.stage_key,
        "Stage Name": stage.name,
        "Phase": stage.phase.value,
        "Responsible Department": stage.responsible_dept.value,
        "Status": stage.status.value,
        "Sort Order": stage.sort_order,
        "Activated At": _iso_datetime(stage.activated_at),
        "Due Date": _iso_date(stage.due_date),
        "Completed At": _iso_datetime(stage.completed_at),
        "Completed By Name": completed_by_name,
        "Comment Count": len(stage.comments),
        "Due Date Request Count": len(stage.due_date_requests),
        "Is Current Stage": bool(current_stage and current_stage.id == stage.id),
        "Project URL": project_url,
        "Last Synced At": _iso_datetime(synced_at),
    }


def _build_comment_record_fields(
    project: ProjectDetail,
    stage: StageRead,
    comment: CommentRead,
    *,
    synced_at: datetime,
    project_url: str | None,
) -> dict:
    return {
        COMMENT_ID_FIELD: str(comment.id),
        STAGE_ID_FIELD: str(stage.id),
        PROJECT_ID_FIELD: str(project.id),
        "Project Code": project.project_code,
        "Project Name": project.name,
        "Stage Name": stage.name,
        "Author Name": comment.author_name,
        "Author Department": comment.department.value,
        "Comment Text": comment.text,
        "Created At": _iso_datetime(comment.created_at),
        "Project URL": project_url,
        "Last Synced At": _iso_datetime(synced_at),
    }


def _build_due_date_request_record_fields(
    project: ProjectDetail,
    stage: StageRead,
    request: StageDueDateChangeRequestRead,
    *,
    synced_at: datetime,
    project_url: str | None,
) -> dict:
    return {
        DUE_DATE_REQUEST_ID_FIELD: str(request.id),
        STAGE_ID_FIELD: str(stage.id),
        PROJECT_ID_FIELD: str(project.id),
        "Project Code": project.project_code,
        "Project Name": project.name,
        "Stage Name": stage.name,
        "Current Due Date": _iso_date(request.current_due_date),
        "Requested Due Date": _iso_date(request.requested_due_date),
        "Reason": request.reason,
        "Requested By": request.requestor_name,
        "Requested By Department": request.requested_by_department.value,
        "Status": request.status.value,
        "Reviewed By": request.reviewer_name,
        "Review Note": request.review_note,
        "Reviewed At": _iso_datetime(request.reviewed_at),
        "Created At": _iso_datetime(request.created_at),
        "Updated At": _iso_datetime(request.updated_at),
        "Project URL": project_url,
        "Last Synced At": _iso_datetime(synced_at),
    }


def _build_workflow_setting_record_fields(
    setting: WorkflowStageSettingRead,
    *,
    synced_at: datetime,
) -> dict:
    return {
        WORKFLOW_STAGE_KEY_FIELD: setting.stage_key,
        "Phase": setting.phase.value,
        "Stage Name": setting.name,
        "Responsible Department": setting.responsible_dept.value,
        "Sort Order": setting.sort_order,
        "Default Due Days": setting.default_due_days,
        "Updated At": _iso_datetime(setting.updated_at),
        "Last Synced At": _iso_datetime(synced_at),
    }


async def _fetch_display_names(connection, user_ids: list[UUID]) -> dict[UUID, str]:
    if not user_ids:
        return {}

    rows = await connection.fetch(
        """
        SELECT
            id,
            COALESCE(NULLIF(full_name, ''), email) AS display_name
        FROM profiles
        WHERE id = ANY($1::uuid[])
        """,
        user_ids,
    )
    return {
        row["id"]: row["display_name"]
        for row in rows
        if row["id"] is not None and row["display_name"]
    }


async def _delete_records_by_key(
    client: AirtableClient,
    *,
    table_name: str,
    key_field: str,
    key_values: list[str],
) -> None:
    for value_chunk in [key_values[index : index + 20] for index in range(0, len(key_values), 20)]:
        formula = build_equals_any_formula(key_field, value_chunk)
        if not formula:
            continue

        records = await client.list_records(
            table_name,
            fields=[key_field],
            filter_formula=formula,
        )
        for record in records:
            await client.delete_record(table_name, record["id"])


async def sync_project_tree(pool, settings: Settings, project_id: UUID) -> None:
    if pool is None or not getattr(settings, "airtable_sync_enabled", False):
        return

    try:
        from routers.projects import load_project_detail

        async with transaction(pool) as connection:
            project = await load_project_detail(
                connection,
                project_id,
                viewer_department=None,
                include_pending=True,
            )
            completed_by_ids = list(
                {
                    stage.completed_by
                    for stage in project.stages
                    if stage.completed_by is not None
                }
            )
            completed_by_names = await _fetch_display_names(connection, completed_by_ids)

        synced_at = datetime.now(timezone.utc)
        project_url = _project_url(settings, project.id)
        client = AirtableClient(settings)

        await client.upsert_records(
            settings.airtable_projects_table,
            key_field=PROJECT_ID_FIELD,
            rows=[
                _build_project_record_fields(
                    project,
                    synced_at=synced_at,
                    project_url=project_url,
                )
            ],
        )
        await client.upsert_records(
            settings.airtable_stages_table,
            key_field=STAGE_ID_FIELD,
            rows=[
                _build_stage_record_fields(
                    project,
                    stage,
                    synced_at=synced_at,
                    project_url=project_url,
                    completed_by_name=completed_by_names.get(stage.completed_by),
                )
                for stage in project.stages
            ],
        )

        comment_rows = [
            _build_comment_record_fields(
                project,
                stage,
                comment,
                synced_at=synced_at,
                project_url=project_url,
            )
            for stage in project.stages
            for comment in stage.comments
        ]
        if comment_rows:
            await client.upsert_records(
                settings.airtable_comments_table,
                key_field=COMMENT_ID_FIELD,
                rows=comment_rows,
            )

        request_rows = [
            _build_due_date_request_record_fields(
                project,
                stage,
                request,
                synced_at=synced_at,
                project_url=project_url,
            )
            for stage in project.stages
            for request in stage.due_date_requests
        ]
        if request_rows:
            await client.upsert_records(
                settings.airtable_due_date_requests_table,
                key_field=DUE_DATE_REQUEST_ID_FIELD,
                rows=request_rows,
            )
    except HTTPException as exc:
        if exc.status_code == 404:
            logger.info("Skipping Airtable sync for missing project %s.", project_id)
            return
        logger.warning("Airtable sync failed for project %s: %s", project_id, exc.detail)
    except AirtableServiceError as exc:
        logger.warning("Airtable sync failed for project %s: %s", project_id, exc)
    except Exception as exc:
        logger.warning("Unexpected Airtable sync failure for project %s: %s", project_id, exc)


async def delete_project_tree(settings: Settings, project_id: UUID) -> None:
    if not getattr(settings, "airtable_sync_enabled", False):
        return

    try:
        client = AirtableClient(settings)
        project_id_value = str(project_id)
        await _delete_records_by_key(
            client,
            table_name=settings.airtable_comments_table,
            key_field=PROJECT_ID_FIELD,
            key_values=[project_id_value],
        )
        await _delete_records_by_key(
            client,
            table_name=settings.airtable_due_date_requests_table,
            key_field=PROJECT_ID_FIELD,
            key_values=[project_id_value],
        )
        await _delete_records_by_key(
            client,
            table_name=settings.airtable_stages_table,
            key_field=PROJECT_ID_FIELD,
            key_values=[project_id_value],
        )
        await _delete_records_by_key(
            client,
            table_name=settings.airtable_projects_table,
            key_field=PROJECT_ID_FIELD,
            key_values=[project_id_value],
        )
    except AirtableServiceError as exc:
        logger.warning("Airtable delete sync failed for project %s: %s", project_id, exc)
    except Exception as exc:
        logger.warning("Unexpected Airtable delete sync failure for project %s: %s", project_id, exc)


async def sync_workflow_settings_to_airtable(pool, settings: Settings) -> None:
    if pool is None or not getattr(settings, "airtable_sync_enabled", False):
        return

    try:
        rows = await fetch_workflow_settings_rows(pool)
        settings_rows = [WorkflowStageSettingRead(**row) for row in rows]
        synced_at = datetime.now(timezone.utc)
        client = AirtableClient(settings)

        await client.upsert_records(
            settings.airtable_workflow_settings_table,
            key_field=WORKFLOW_STAGE_KEY_FIELD,
            rows=[
                _build_workflow_setting_record_fields(setting, synced_at=synced_at)
                for setting in settings_rows
            ],
        )

        current_keys = {setting.stage_key for setting in settings_rows}
        existing_records = await client.list_records(
            settings.airtable_workflow_settings_table,
            fields=[WORKFLOW_STAGE_KEY_FIELD],
        )
        for record in existing_records:
            stage_key = record.get("fields", {}).get(WORKFLOW_STAGE_KEY_FIELD)
            if stage_key and stage_key not in current_keys:
                await client.delete_record(settings.airtable_workflow_settings_table, record["id"])
    except AirtableServiceError as exc:
        logger.warning("Airtable workflow-settings sync failed: %s", exc)
    except Exception as exc:
        logger.warning("Unexpected Airtable workflow-settings sync failure: %s", exc)


async def sync_all_to_airtable(pool, settings: Settings) -> None:
    if pool is None or not getattr(settings, "airtable_sync_enabled", False):
        return

    try:
        await sync_workflow_settings_to_airtable(pool, settings)
        project_rows = await pool.fetch(
            """
            SELECT id
            FROM projects
            WHERE is_archived = FALSE
            ORDER BY created_at DESC
            """
        )
        for row in project_rows:
            await sync_project_tree(pool, settings, row["id"])
    except Exception as exc:
        logger.warning("Airtable full resync failed: %s", exc)
