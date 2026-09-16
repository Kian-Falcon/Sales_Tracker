import logging
import re
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status

from auth import get_current_user
from config import Settings, get_settings
from database import get_pool, record_to_dict, set_audit_actor, transaction
from models.comment import CommentCreate, CommentRead
from models.common import CurrentUser, Department
from models.profile import MentionableProfileRead
from services.notification import NotificationService

router = APIRouter(prefix="/api/v1/stages", tags=["comments"])
logger = logging.getLogger(__name__)
MENTION_PATTERN = re.compile(r"(?<!\S)@([A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,})\b")


async def _send_comment_mention_task(settings: Settings, payload: dict) -> None:
    try:
        await NotificationService(settings).send_comment_mention(**payload)
    except Exception as exc:
        logger.warning(
            "Comment mention email could not be sent for %s / %s: %s",
            payload.get("project_code", "project"),
            payload.get("stage_name", "stage"),
            exc,
        )


def _extract_mentioned_emails(text: str) -> list[str]:
    seen: set[str] = set()
    mentioned_emails: list[str] = []
    for email in MENTION_PATTERN.findall(text):
        normalized = email.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        mentioned_emails.append(normalized)

    return mentioned_emails


def _allowed_viewer_departments(stage_department: str) -> list[str]:
    allowed = {stage_department, Department.SALES.value, Department.ADMIN.value}
    return sorted(allowed)


@router.get("/{stage_id}/mentionable-users", response_model=list[MentionableProfileRead])
async def list_stage_mentionable_users(
    stage_id: UUID,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> list[MentionableProfileRead]:
    async with transaction(pool) as connection:
        stage = await connection.fetchrow("SELECT * FROM stages WHERE id = $1", stage_id)
        if stage is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

        allowed_departments = _allowed_viewer_departments(stage["responsible_dept"])
        if user.department.value not in allowed_departments:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You cannot view mentionable users for this stage.")

        rows = await connection.fetch(
            """
            SELECT
                id,
                COALESCE(NULLIF(full_name, ''), email) AS display_name,
                email,
                department
            FROM profiles
            WHERE email IS NOT NULL
              AND NULLIF(email, '') IS NOT NULL
              AND id <> $1
              AND department = ANY($2::text[])
            ORDER BY display_name, email
            """,
            user.user_id,
            allowed_departments,
        )

    return [MentionableProfileRead(**record_to_dict(row)) for row in rows]


@router.post("/{stage_id}/comments", response_model=CommentRead, status_code=status.HTTP_201_CREATED)
async def add_comment(
    stage_id: UUID,
    payload: CommentCreate,
    background_tasks: BackgroundTasks = None,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(get_current_user),
) -> CommentRead:
    mentioned_emails = _extract_mentioned_emails(payload.text)
    inserted_comment: CommentRead | None = None
    mention_notification_payload: dict | None = None

    async with transaction(pool) as connection:
        stage = await connection.fetchrow("SELECT * FROM stages WHERE id = $1", stage_id)
        if stage is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

        if stage["status"] not in {"active", "overdue"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Comments are only allowed while a stage is active or overdue.",
            )

        await set_audit_actor(connection, user.user_id)

        row = await connection.fetchrow(
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
        inserted_comment = CommentRead(**record_to_dict(row))

        if mentioned_emails:
            allowed_departments = _allowed_viewer_departments(stage["responsible_dept"])
            mentioned_rows = await connection.fetch(
                """
                SELECT
                    id,
                    email,
                    COALESCE(NULLIF(full_name, ''), email) AS display_name
                FROM profiles
                WHERE LOWER(email) = ANY($1::text[])
                  AND id <> $2
                  AND department = ANY($3::text[])
                ORDER BY email
                """,
                mentioned_emails,
                user.user_id,
                allowed_departments,
            )

            recipients = [row["email"] for row in mentioned_rows if row["email"]]
            if recipients:
                project_row = await connection.fetchrow(
                    """
                    SELECT
                        p.id AS project_id,
                        p.project_code,
                        p.name AS project_name,
                        s.name AS stage_name
                    FROM stages s
                    JOIN projects p ON p.id = s.project_id
                    WHERE s.id = $1
                    """,
                    stage_id,
                )
                mention_notification_payload = {
                    "project_code": project_row["project_code"] if project_row else "Project",
                    "project_name": project_row["project_name"] if project_row else "Workflow project",
                    "stage_name": project_row["stage_name"] if project_row else stage["name"],
                    "author_name": inserted_comment.author_name,
                    "author_department": user.department.value,
                    "comment_text": payload.text,
                    "recipients": recipients,
                    "project_url": f"{settings.frontend_url.rstrip('/')}/projects/{project_row['project_id']}" if settings.frontend_url and project_row else None,
                }

    if mention_notification_payload:
        if background_tasks is not None:
            background_tasks.add_task(_send_comment_mention_task, settings, mention_notification_payload)
        else:
            await _send_comment_mention_task(settings, mention_notification_payload)

    return inserted_comment
