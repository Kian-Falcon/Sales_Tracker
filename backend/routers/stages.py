import logging
from datetime import date, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from auth import get_current_user
from config import Settings, get_settings
from database import get_pool, set_audit_actor, transaction
from models.common import CurrentUser, Department
from models.project import ProjectDetail
from models.stage import (
    StageDueDateChangeRequestCreate,
    StageDueDateChangeRequestReview,
    StageDueDateUpdate,
)
from routers.projects import load_project_detail
from services.notification import NotificationService
from services.workflow_settings import get_due_days_by_stage_key

router = APIRouter(prefix="/api/v1/stages", tags=["stages"])
logger = logging.getLogger(__name__)


def _completion_timing_label(*, due_date: date | None, completed_on: date, previous_status: str) -> str:
    if due_date is None:
        return "completed_without_scheduled_due_date"

    if previous_status == "overdue" or completed_on > due_date:
        return "completed_after_time"

    if completed_on < due_date:
        return "completed_before_time"

    return "completed_on_time"


async def _resolve_display_name(connection, user: CurrentUser) -> str:
    profile = await connection.fetchrow(
        """
        SELECT COALESCE(NULLIF(full_name, ''), email) AS display_name
        FROM profiles
        WHERE id = $1
        """,
        user.user_id,
    )
    if profile and profile["display_name"]:
        return profile["display_name"]

    return user.email or user.department.value


async def _list_profile_emails(
    connection,
    *,
    departments: list[Department] | None = None,
    user_ids: list[UUID] | None = None,
) -> list[str]:
    clauses = [
        "email IS NOT NULL",
        "NULLIF(email, '') IS NOT NULL",
    ]
    args: list[object] = []

    if departments:
        args.append([department.value for department in departments])
        clauses.append(f"department = ANY(${len(args)}::text[])")

    if user_ids:
        args.append(user_ids)
        clauses.append(f"id = ANY(${len(args)}::uuid[])")

    rows = await connection.fetch(
        f"""
        SELECT DISTINCT email
        FROM profiles
        WHERE {' AND '.join(clauses)}
        ORDER BY email
        """,
        *args,
    )
    return [row["email"] for row in rows if row["email"]]


@router.patch("/{stage_id}/complete")
async def complete_stage(
    stage_id: UUID,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(get_current_user),
):
    notification_payload: dict | None = None

    async with transaction(pool) as connection:
        stage = await connection.fetchrow("SELECT * FROM stages WHERE id = $1", stage_id)
        if stage is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

        if stage["responsible_dept"] != user.department.value and user.department != Department.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your stage to complete.")

        if stage["status"] not in {"active", "overdue"}:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only active or overdue stages can be completed.")

        completed_on = date.today()
        timing_label = _completion_timing_label(
            due_date=stage["due_date"],
            completed_on=completed_on,
            previous_status=stage["status"],
        )

        await set_audit_actor(connection, user.user_id)

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
            next_due_date = next_stage["due_date"] if due_days is None else completed_on + timedelta(days=due_days)
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

            project_row = await connection.fetchrow(
                """
                SELECT project_code, name
                FROM projects
                WHERE id = $1
                """,
                stage["project_id"],
            )
            next_stage_department = Department(next_stage["responsible_dept"])
            recipients = await _list_profile_emails(connection, departments=[next_stage_department])
            notification_payload = {
                "project_code": project_row["project_code"] if project_row else "Project",
                "project_name": project_row["name"] if project_row else "Workflow project",
                "completed_stage_name": stage["name"],
                "completed_stage_department": stage["responsible_dept"],
                "next_stage_name": next_stage["name"],
                "next_stage_department": next_stage["responsible_dept"],
                "due_date": next_due_date,
                "handoff_status": timing_label,
                "recipients": recipients,
                "project_url": f"{settings.frontend_url.rstrip('/')}/projects/{stage['project_id']}" if settings.frontend_url else None,
            }

        detail = await load_project_detail(
            connection,
            stage["project_id"],
            viewer_department=user.department,
        )

    if notification_payload:
        try:
            await NotificationService(settings).send_stage_handoff_notification(**notification_payload)
        except Exception as exc:
            logger.warning(
                "Stage handoff email could not be sent for %s / %s: %s",
                notification_payload["project_code"],
                notification_payload["next_stage_name"],
                exc,
            )

    return detail


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

        if user.department not in {Department.SALES, Department.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only Sales or Admin can set or update due dates directly.",
            )

        pending_request = await connection.fetchrow(
            """
            SELECT id
            FROM stage_due_date_change_requests
            WHERE stage_id = $1
              AND status = 'pending'
            """,
            stage_id,
        )
        if pending_request is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This stage has a pending due-date request. Review it before setting the due date directly.",
            )

        await set_audit_actor(connection, user.user_id)

        await connection.execute(
            """
            UPDATE stages
            SET due_date = $2,
                status = CASE
                    WHEN status = 'overdue' AND $2 >= CURRENT_DATE THEN 'active'
                    ELSE status
                END
            WHERE id = $1
            """,
            stage_id,
            payload.due_date,
        )

        return await load_project_detail(
            connection,
            stage["project_id"],
            viewer_department=user.department,
        )


@router.post("/{stage_id}/due-date-requests", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def request_stage_due_date_change(
    stage_id: UUID,
    payload: StageDueDateChangeRequestCreate,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectDetail:
    notification_payload: dict | None = None

    async with transaction(pool) as connection:
        stage = await connection.fetchrow(
            """
            SELECT
                s.*,
                p.project_code,
                p.name AS project_name
            FROM stages s
            JOIN projects p ON p.id = s.project_id
            WHERE s.id = $1
            """,
            stage_id,
        )
        if stage is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stage not found.")

        if user.department in {Department.SALES, Department.ADMIN}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Sales or Admin can update due dates directly and do not need to raise a request.",
            )

        if stage["responsible_dept"] != user.department.value:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the stage's responsible department can request a due-date change.",
            )

        if stage["status"] not in {"active", "overdue"}:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Due-date requests are only allowed while a stage is active or overdue.",
            )

        if stage["due_date"] == payload.requested_due_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Requested due date matches the current due date.",
            )

        pending_request = await connection.fetchrow(
            """
            SELECT id
            FROM stage_due_date_change_requests
            WHERE stage_id = $1
              AND status = 'pending'
            """,
            stage_id,
        )
        if pending_request is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A due-date change request is already pending for this stage.",
            )

        await set_audit_actor(connection, user.user_id)
        await connection.execute(
            """
            INSERT INTO stage_due_date_change_requests (
                stage_id,
                requested_by,
                requested_by_department,
                current_due_date,
                requested_due_date,
                reason
            )
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            stage_id,
            user.user_id,
            user.department.value,
            stage["due_date"],
            payload.requested_due_date,
            payload.reason.strip(),
        )

        requester_name = await _resolve_display_name(connection, user)
        recipients = await _list_profile_emails(connection, departments=[Department.SALES, Department.ADMIN])
        notification_payload = {
            "project_code": stage["project_code"],
            "project_name": stage["project_name"],
            "stage_name": stage["name"],
            "current_due_date": stage["due_date"],
            "requested_due_date": payload.requested_due_date,
            "requested_by_name": requester_name,
            "requested_by_department": user.department.value,
            "reason": payload.reason.strip(),
            "recipients": recipients,
            "project_url": f"{settings.frontend_url.rstrip('/')}/projects/{stage['project_id']}" if settings.frontend_url else None,
        }

        detail = await load_project_detail(
            connection,
            stage["project_id"],
            settings=settings,
            viewer_department=user.department,
        )

    if notification_payload:
        try:
            await NotificationService(settings).send_due_date_change_request(**notification_payload)
        except Exception as exc:
            logger.warning(
                "Due-date request email could not be sent for %s / %s: %s",
                notification_payload["project_code"],
                notification_payload["stage_name"],
                exc,
            )

    return detail


@router.post("/{stage_id}/due-date-requests/{request_id}/review", response_model=ProjectDetail)
async def review_stage_due_date_request(
    stage_id: UUID,
    request_id: UUID,
    payload: StageDueDateChangeRequestReview,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectDetail:
    if user.department not in {Department.SALES, Department.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Sales or Admin can review due-date change requests.",
        )

    notification_payload: dict | None = None

    async with transaction(pool) as connection:
        request_row = await connection.fetchrow(
            """
            SELECT
                r.*,
                s.project_id,
                s.name AS stage_name,
                p.project_code,
                p.name AS project_name,
                COALESCE(NULLIF(requestor.full_name, ''), requestor.email, r.requested_by_department) AS requestor_name
            FROM stage_due_date_change_requests r
            JOIN stages s ON s.id = r.stage_id
            JOIN projects p ON p.id = s.project_id
            LEFT JOIN profiles requestor ON requestor.id = r.requested_by
            WHERE r.id = $1
              AND r.stage_id = $2
            """,
            request_id,
            stage_id,
        )
        if request_row is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Due-date request not found.")

        if request_row["status"] != "pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="This due-date request has already been reviewed.",
            )

        await set_audit_actor(connection, user.user_id)
        reviewer_name = await _resolve_display_name(connection, user)
        review_note = payload.note.strip() if payload.note else None

        if payload.action.value == "approve":
            await connection.execute(
                """
                UPDATE stages
                SET due_date = $2,
                    status = CASE
                        WHEN status = 'overdue' AND $2 >= CURRENT_DATE THEN 'active'
                        ELSE status
                    END
                WHERE id = $1
                """,
                stage_id,
                request_row["requested_due_date"],
            )
            new_status = "approved"
            recipients = await _list_profile_emails(connection)
        else:
            new_status = "rejected"
            recipients = await _list_profile_emails(connection, user_ids=[request_row["requested_by"]])

        await connection.execute(
            """
            UPDATE stage_due_date_change_requests
            SET status = $2,
                reviewed_by = $3,
                review_note = $4,
                reviewed_at = NOW(),
                updated_at = NOW()
            WHERE id = $1
            """,
            request_id,
            new_status,
            user.user_id,
            review_note,
        )

        notification_payload = {
            "project_code": request_row["project_code"],
            "project_name": request_row["project_name"],
            "stage_name": request_row["stage_name"],
            "status": new_status,
            "previous_due_date": request_row["current_due_date"],
            "requested_due_date": request_row["requested_due_date"],
            "requested_by_name": request_row["requestor_name"],
            "reviewed_by_name": reviewer_name,
            "reason": request_row["reason"],
            "review_note": review_note,
            "recipients": recipients,
            "project_url": f"{settings.frontend_url.rstrip('/')}/projects/{request_row['project_id']}" if settings.frontend_url else None,
        }

        detail = await load_project_detail(
            connection,
            request_row["project_id"],
            settings=settings,
            viewer_department=user.department,
        )

    if notification_payload:
        try:
            await NotificationService(settings).send_due_date_change_resolution(**notification_payload)
        except Exception as exc:
            logger.warning(
                "Due-date resolution email could not be sent for %s / %s: %s",
                notification_payload["project_code"],
                notification_payload["stage_name"],
                exc,
            )

    return detail
