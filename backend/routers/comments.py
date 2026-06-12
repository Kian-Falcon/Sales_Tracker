from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_current_user
from database import get_pool, record_to_dict
from models.comment import CommentCreate, CommentRead
from models.common import CurrentUser

router = APIRouter(prefix="/api/v1/stages", tags=["comments"])


@router.post("/{stage_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def add_comment(
    stage_id: UUID,
    payload: CommentCreate,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> CommentRead:
    stage = await pool.fetchrow("SELECT * FROM stages WHERE id = $1", stage_id)
    if stage is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

    if stage["status"] not in {"active", "overdue"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Comments are only allowed while a stage is active or overdue.",
        )

    row = await pool.fetchrow(
        """
        WITH inserted AS (
            INSERT INTO comments (stage_id, user_id, department, text)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        )
        SELECT
            inserted.*,
            COALESCE(NULLIF(p.full_name, ''), p.email, inserted.department) AS author_name
        FROM inserted
        LEFT JOIN profiles p ON p.id = inserted.user_id
        """,
        stage_id,
        user.user_id,
        user.department.value,
        payload.text,
    )
    return CommentRead(**record_to_dict(row))
