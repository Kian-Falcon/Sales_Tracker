from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_current_user
from database import get_pool, transaction
from models.common import CurrentUser, Department
from models.project import ProjectDetail
from models.stage import StageDueDateUpdate
from routers.projects import load_project_detail
from services.workflow_settings import get_due_days_by_stage_key

router = APIRouter(prefix="/api/v1/stages", tags=["stages"])


@router.patch("/{stage_id}/complete")
async def complete_stage(
    stage_id: UUID,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
):
    async with transaction(pool) as connection:
        stage = await connection.fetchrow("SELECT * FROM stages WHERE id = $1", stage_id)
        if stage is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

        if stage["responsible_dept"] != user.department.value and user.department != Department.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your stage to complete.")

        if stage["status"] not in {"active", "overdue"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only active or overdue stages can be completed.")

        await connection.execute(
            """
            UPDATE stages
            SET status = 'done',
                completed_at = NOW(),
                completed_by = $2
            WHERE id = $1
            """,
            stage_id,
            user.user_id,
        )

        next_stage = await connection.fetchrow(
            """
            SELECT *
            FROM stages
            WHERE project_id = $1
              AND sort_order > $2
              AND status = 'pending'
            ORDER BY sort_order
            LIMIT 1
            """,
            stage["project_id"],
            stage["sort_order"],
        )

        if next_stage is not None:
            due_days = (await get_due_days_by_stage_key(connection)).get(next_stage["stage_key"])
            await connection.execute(
                """
                UPDATE stages
                SET status = 'active',
                    activated_at = NOW(),
                    due_date = CASE WHEN $2::int IS NULL THEN due_date ELSE CURRENT_DATE + $2::int END
                WHERE id = $1
                """,
                next_stage["id"],
                due_days,
            )

        return await load_project_detail(connection, stage["project_id"])


@router.patch("/{stage_id}/due-date", response_model=ProjectDetail)
async def set_stage_due_date(
    stage_id: UUID,
    payload: StageDueDateUpdate,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectDetail:
    async with transaction(pool) as connection:
        stage = await connection.fetchrow("SELECT * FROM stages WHERE id = $1", stage_id)
        if stage is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

        if user.department == Department.ADMIN:
            allowed = True
        else:
            allowed = stage["due_date"] is None and (
                user.department == Department.SALES or stage["responsible_dept"] == user.department.value
            )

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Due dates lock after scheduling. Only Admin can change an existing date.",
            )

        await connection.execute(
            "UPDATE stages SET due_date = $2 WHERE id = $1",
            stage_id,
            payload.due_date,
        )

        return await load_project_detail(connection, stage["project_id"])
