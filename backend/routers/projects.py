import csv
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from uuid import UUID

from asyncpg import UniqueViolationError
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from auth import get_current_user, require_departments
from database import get_pool, record_to_dict, records_to_dicts, set_audit_actor, transaction
from models.comment import CommentRead
from models.common import CurrentUser, Department, StageSnapshot
from models.project import DashboardSummary, ProjectCreate, ProjectDetail, ProjectSummary
from models.stage import StageRead
from services.workflow_settings import load_stage_blueprint

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])


def _project_status_label(current_stage_status: str | None) -> str:
    if current_stage_status == "overdue":
        return "Overdue"

    if current_stage_status:
        return "Active"

    return "Completed"


def _stage_status_label(current_stage_status: str | None) -> str:
    if not current_stage_status:
        return ""

    return current_stage_status.replace("_", " ").title()


def _eta_label(current_stage_due_date: date | None, current_stage_status: str | None) -> str:
    if current_stage_status is None:
        return "--"

    if current_stage_due_date is None:
        return "Not set"

    diff_days = (current_stage_due_date - date.today()).days
    is_late = current_stage_status == "overdue" or diff_days < 0

    if is_late:
        return f"{abs(diff_days)}d late"

    if diff_days == 0:
        return "Due today"

    return f"{diff_days}d left"


def _format_pending_duration(start_value: datetime | None, end_value: datetime | None = None) -> str:
    if start_value is None:
        return "Not started"

    end = end_value or datetime.now(timezone.utc)
    diff = max(timedelta(0), end - start_value)

    if diff.days >= 1:
        return f"{diff.days} day{'' if diff.days == 1 else 's'}"

    diff_hours = int(diff.total_seconds() // 3600)
    if diff_hours >= 1:
        return f"{diff_hours} hour{'' if diff_hours == 1 else 's'}"

    return "Less than 1 hour"


def _build_project_detail(project: dict, stage_rows: list[dict], comment_rows: list[dict]) -> ProjectDetail:
    comments_by_stage: dict[UUID, list[CommentRead]] = defaultdict(list)
    for comment in comment_rows:
        comments_by_stage[comment["stage_id"]].append(CommentRead(**comment))

    stages = [
        StageRead(
            **stage,
            comments=comments_by_stage.get(stage["id"], []),
        )
        for stage in stage_rows
    ]
    return ProjectDetail(**project, stages=stages)


async def load_project_detail(connection, project_id: UUID) -> ProjectDetail:
    """Load a full project detail (project + ordered stages + comments).

    Accepts a pool or an in-transaction connection so callers that mutate stages
    can return the refreshed detail without duplicating these queries.
    """
    project_row = await connection.fetchrow("SELECT * FROM projects WHERE id = $1", project_id)
    if project_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    stage_rows = records_to_dicts(
        await connection.fetch("SELECT * FROM stages WHERE project_id = $1 ORDER BY sort_order", project_id)
    )
    comment_rows = records_to_dicts(
        await connection.fetch(
            """
            SELECT
                c.*,
                COALESCE(NULLIF(p.full_name, ''), p.email, c.department) AS author_name
            FROM comments c
            JOIN stages s ON s.id = c.stage_id
            LEFT JOIN profiles p ON p.id = c.user_id
            WHERE s.project_id = $1
            ORDER BY c.created_at ASC
            """,
            project_id,
        )
    )

    return _build_project_detail(record_to_dict(project_row), stage_rows, comment_rows)


@router.get("", response_model=list[ProjectSummary])
async def list_projects(
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> list[ProjectSummary]:
    rows = await pool.fetch(
        """
        SELECT
            p.*,
            s.id AS current_stage_id,
            s.name AS current_stage_name,
            s.phase AS current_stage_phase,
            s.responsible_dept AS current_stage_dept,
            s.status AS current_stage_status,
            s.activated_at AS current_stage_activated_at,
            s.due_date AS current_stage_due_date
        FROM projects p
        LEFT JOIN LATERAL (
            SELECT *
            FROM stages
            WHERE project_id = p.id
              AND status IN ('active', 'overdue')
            ORDER BY sort_order
            LIMIT 1
        ) s ON TRUE
        WHERE p.is_archived = FALSE
        ORDER BY p.created_at DESC
        """
    )

    results: list[ProjectSummary] = []
    for row in records_to_dicts(rows):
        snapshot = None
        if row["current_stage_id"]:
            snapshot = StageSnapshot(
                id=row["current_stage_id"],
                name=row["current_stage_name"],
                phase=row["current_stage_phase"],
                responsible_dept=row["current_stage_dept"],
                status=row["current_stage_status"],
                activated_at=row["current_stage_activated_at"],
                due_date=row["current_stage_due_date"],
            )

        results.append(
            ProjectSummary(
                id=row["id"],
                project_code=row["project_code"],
                name=row["name"],
                client=row["client"],
                brand=row["brand"],
                created_at=row["created_at"],
                is_archived=row["is_archived"],
                current_stage=snapshot,
            )
        )

    return results


@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
) -> ProjectDetail:
    try:
        async with transaction(pool) as connection:
            stage_blueprint = await load_stage_blueprint(connection)
            await set_audit_actor(connection, user.user_id)
            project = await connection.fetchrow(
                """
                INSERT INTO projects (project_code, name, client, brand, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *
                """,
                payload.project_code,
                payload.name,
                payload.client,
                payload.brand,
                user.user_id,
            )

            for index, template in enumerate(stage_blueprint):
                is_active = index == 0
                # Only the active stage gets a due date now; pending stages are dated
                # when they activate (see stages.complete_stage), so "overdue" always
                # reflects the stage a department is actually working on.
                due_date = (
                    date.today() + timedelta(days=template.default_due_days)
                    if is_active and template.default_due_days is not None
                    else None
                )
                activated_at = datetime.now(timezone.utc) if is_active else None

                await connection.execute(
                    """
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
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                    """,
                    project["id"],
                    template.stage_key,
                    template.phase.value,
                    template.name,
                    template.responsible_dept.value,
                    "active" if is_active else "pending",
                    template.sort_order,
                    due_date,
                    activated_at,
                )

            stage_rows = records_to_dicts(
                await connection.fetch("SELECT * FROM stages WHERE project_id = $1 ORDER BY sort_order", project["id"])
            )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Project code '{payload.project_code}' already exists.",
        ) from exc

    return _build_project_detail(record_to_dict(project), stage_rows, [])


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: UUID,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectDetail:
    return await load_project_detail(pool, project_id)


@router.get("/export/csv")
async def export_projects_csv(
    pool=Depends(get_pool),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
) -> StreamingResponse:
    rows = await pool.fetch(
        """
        SELECT
            p.project_code,
            p.name AS project_name,
            p.client,
            p.brand,
            p.created_at,
            s.name AS current_stage_name,
            s.phase AS current_stage_phase,
            s.responsible_dept AS current_stage_dept,
            s.status AS current_stage_status,
            s.activated_at AS current_stage_activated_at,
            s.due_date AS current_stage_due_date
        FROM projects p
        LEFT JOIN LATERAL (
            SELECT *
            FROM stages
            WHERE project_id = p.id
              AND status IN ('active', 'overdue')
            ORDER BY sort_order
            LIMIT 1
        ) s ON TRUE
        WHERE p.is_archived = FALSE
        ORDER BY p.created_at DESC
        """
    )

    buffer = StringIO()
    writer = csv.DictWriter(
        buffer,
        fieldnames=[
            "project_code",
            "project_name",
            "client",
            "brand",
            "project_status",
            "current_stage",
            "current_phase",
            "responsible_department",
            "stage_status",
            "due_date",
            "eta",
            "pending_duration",
            "activated_at",
            "created_at",
        ],
    )
    writer.writeheader()
    for row in records_to_dicts(rows):
        writer.writerow(
            {
                "project_code": row["project_code"],
                "project_name": row["project_name"],
                "client": row["client"],
                "brand": row["brand"] or "",
                "project_status": _project_status_label(row["current_stage_status"]),
                "current_stage": row["current_stage_name"] or "",
                "current_phase": row["current_stage_phase"].title() if row["current_stage_phase"] else "",
                "responsible_department": row["current_stage_dept"] or "",
                "stage_status": _stage_status_label(row["current_stage_status"]),
                "due_date": row["current_stage_due_date"].isoformat() if row["current_stage_due_date"] else "",
                "eta": _eta_label(row["current_stage_due_date"], row["current_stage_status"]),
                "pending_duration": _format_pending_duration(row["current_stage_activated_at"])
                if row["current_stage_status"]
                else "Completed",
                "activated_at": row["current_stage_activated_at"].isoformat()
                if row["current_stage_activated_at"]
                else "",
                "created_at": row["created_at"].isoformat(),
            }
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="workflow-tracker-export.csv"'},
    )
