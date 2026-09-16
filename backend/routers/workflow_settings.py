from fastapi import APIRouter, Depends, HTTPException, status

from auth import require_departments
from database import get_pool, set_audit_actor, transaction
from models.common import CurrentUser, Department
from models.workflow_settings import (
    WorkflowStageSettingRead,
    WorkflowStageSettingUpdateRequest,
)
from services.workflow_settings import (
    fetch_workflow_settings_rows,
    sync_pending_stages_with_workflow_settings,
)

router = APIRouter(prefix="/api/v1/workflow-settings", tags=["workflow-settings"])


@router.get("", response_model=list[WorkflowStageSettingRead])
async def list_workflow_settings(
    pool=Depends(get_pool),
    user: CurrentUser = Depends(require_departments(Department.ADMIN)),
) -> list[WorkflowStageSettingRead]:
    rows = await fetch_workflow_settings_rows(pool)
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Workflow settings are not available. Run the latest SQL migrations first.",
        )
    return [WorkflowStageSettingRead(**row) for row in rows]


@router.put("", response_model=list[WorkflowStageSettingRead])
async def update_workflow_settings(
    payload: WorkflowStageSettingUpdateRequest,
    pool=Depends(get_pool),
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

        if not any(item.is_enabled for item in payload.settings):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one workflow stage must remain enabled.",
            )

        await connection.executemany(
            """
            UPDATE workflow_stage_settings
            SET responsible_dept = $2,
                is_enabled = $3,
                default_due_days = $4,
                updated_at = NOW()
            WHERE stage_key = $1
            """,
            [
                (
                    item.stage_key,
                    item.responsible_dept.value,
                    item.is_enabled,
                    item.default_due_days,
                )
                for item in payload.settings
            ],
        )

        # Keep not-yet-started work aligned with the latest template ownership.
        await set_audit_actor(connection, user.user_id)
        await sync_pending_stages_with_workflow_settings(connection)

        updated_rows = await fetch_workflow_settings_rows(connection)

    return [WorkflowStageSettingRead(**row) for row in updated_rows]
