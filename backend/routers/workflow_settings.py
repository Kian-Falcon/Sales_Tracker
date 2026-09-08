from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from auth import require_departments
from config import Settings, get_settings
from database import get_pool, set_audit_actor, transaction
from models.common import CurrentUser, Department
from models.workflow_settings import (
    WorkflowStageSettingRead,
    WorkflowStageSettingUpdateRequest,
)
from services.airtable_sync import sync_workflow_settings_to_airtable
from services.workflow_settings import fetch_workflow_settings_rows

router = APIRouter(prefix="/api/v1/workflow-settings", tags=["workflow-settings"])


@router.get("", response_model=list[WorkflowStageSettingRead])
async def list_workflow_settings(
    pool=Depends(get_pool),
    user: CurrentUser = Depends(require_departments(Department.ADMIN)),
) -> list[WorkflowStageSettingRead]:
    rows = await fetch_workflow_settings_rows(pool)
    return [WorkflowStageSettingRead(**row) for row in rows]


@router.put("", response_model=list[WorkflowStageSettingRead])
async def update_workflow_settings(
    payload: WorkflowStageSettingUpdateRequest,
    background_tasks: BackgroundTasks = None,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(require_departments(Department.ADMIN)),
) -> list[WorkflowStageSettingRead]:
    async with transaction(pool) as connection:
        rows = await fetch_workflow_settings_rows(connection)
        if not rows:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Workflow settings are not available. Run the latest SQL migrations first.",
            )

        expected_keys = {row["stage_key"] for row in rows}
        received_keys = {item.stage_key for item in payload.settings}
        if len(received_keys) != len(payload.settings):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Duplicate stage keys in payload.")

        if received_keys != expected_keys:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Workflow settings payload must include every configured stage exactly once.",
            )

        await connection.executemany(
            """
            UPDATE workflow_stage_settings
            SET responsible_dept = $2,
                default_due_days = $3,
                updated_at = NOW()
            WHERE stage_key = $1
            """,
            [
                (
                    item.stage_key,
                    item.responsible_dept.value,
                    item.default_due_days,
                )
                for item in payload.settings
            ],
        )

        # Keep not-yet-started work aligned with the latest template ownership.
        await set_audit_actor(connection, user.user_id)
        await connection.execute(
            """
            UPDATE stages AS s
            SET phase = w.phase,
                name = w.name,
                responsible_dept = w.responsible_dept,
                sort_order = w.sort_order
            FROM workflow_stage_settings AS w
            WHERE s.stage_key = w.stage_key
              AND s.status = 'pending'
            """
        )

        updated_rows = await fetch_workflow_settings_rows(connection)

    if background_tasks is not None:
        background_tasks.add_task(sync_workflow_settings_to_airtable, pool, settings)
    else:
        await sync_workflow_settings_to_airtable(pool, settings)

    return [WorkflowStageSettingRead(**row) for row in updated_rows]
