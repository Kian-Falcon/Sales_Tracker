import asyncio
import csv
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from uuid import UUID

from asyncpg import UniqueViolationError
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from fastapi.responses import Response, StreamingResponse

from auth import get_current_user, require_departments
from config import Settings, get_settings
from database import get_pool, record_to_dict, records_to_dicts, set_audit_actor, transaction
from models.comment import CommentRead
from models.common import CurrentUser, Department, ProjectDocumentType, StageSnapshot
from models.project import ProjectCreate, ProjectDetail, ProjectDocumentRead, ProjectSummary, ProjectUpdate
from models.stage import StageDueDateChangeRequestRead, StageRead
from services.storage import (
    StorageServiceError,
    build_project_document_path,
    create_signed_download_url,
    delete_storage_object,
    is_supported_project_document,
    upload_storage_object,
)
from services.notification import NotificationService
from services.workflow_settings import load_stage_blueprint

router = APIRouter(prefix="/api/v1/projects", tags=["projects"])
logger = logging.getLogger(__name__)


async def _send_project_created_summary_task(settings: Settings, payload: dict) -> None:
    try:
        await NotificationService(settings).send_project_created_summary(**payload)
    except Exception as exc:
        logger.warning(
            "Project %s was created but summary email could not be sent: %s",
            payload.get("project_code", "project"),
            exc,
        )


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

    return ""


def _normalize_project_row(row: dict | None) -> dict | None:
    if row is None:
        return None

    normalized = dict(row)
    if normalized.get("total_order_value") is not None:
        normalized["total_order_value"] = float(normalized["total_order_value"])

    return normalized


async def _build_project_documents(
    document_rows: list[dict],
    settings: Settings | None = None,
) -> list[ProjectDocumentRead]:
    if not document_rows:
        return []

    signed_urls: list[str | None] = [None] * len(document_rows)
    if settings and settings.supabase_url and settings.supabase_service_key:
        tasks = [
            create_signed_download_url(
                settings,
                bucket=row["storage_bucket"],
                path=row["storage_path"],
            )
            for row in document_rows
        ]
        signed_results = await asyncio.gather(*tasks, return_exceptions=True)
        signed_urls = [
            result if isinstance(result, str) else None
            for result in signed_results
        ]

    return [
        ProjectDocumentRead(
            **{
                **row,
                "file_size": int(row["file_size"]),
            },
            download_url=signed_urls[index],
        )
        for index, row in enumerate(document_rows)
    ]


def _build_project_detail(
    project: dict,
    stage_rows: list[dict],
    comment_rows: list[dict],
    due_date_request_rows: list[dict],
    documents: list[ProjectDocumentRead] | None = None,
) -> ProjectDetail:
    comments_by_stage: dict[UUID, list[CommentRead]] = defaultdict(list)
    for comment in comment_rows:
        comments_by_stage[comment["stage_id"]].append(CommentRead(**comment))

    requests_by_stage: dict[UUID, list[StageDueDateChangeRequestRead]] = defaultdict(list)
    for request in due_date_request_rows:
        requests_by_stage[request["stage_id"]].append(StageDueDateChangeRequestRead(**request))

    stages = [
        StageRead(
            **stage,
            comments=comments_by_stage.get(stage["id"], []),
            due_date_requests=requests_by_stage.get(stage["id"], []),
        )
        for stage in stage_rows
    ]
    return ProjectDetail(**project, stages=stages, documents=documents or [])


async def load_project_detail(
    connection,
    project_id: UUID,
    settings: Settings | None = None,
    viewer_department: Department | None = None,
) -> ProjectDetail:
    """Load a full project detail (project + ordered stages + comments + documents)."""
    project_row = await connection.fetchrow(
        """
        SELECT
            pr.*,
            COALESCE(NULLIF(owner.full_name, ''), owner.email) AS created_by_name,
            owner.department AS created_by_department
        FROM projects pr
        LEFT JOIN profiles owner ON owner.id = pr.created_by
        WHERE pr.id = $1
        """,
        project_id,
    )
    if project_row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    stage_rows = records_to_dicts(
        await connection.fetch("SELECT * FROM stages WHERE project_id = $1 ORDER BY sort_order", project_id)
    )
    if viewer_department not in {None, Department.SALES, Department.ADMIN}:
        stage_rows = [
            stage
            for stage in stage_rows
            if stage["responsible_dept"] == viewer_department.value
        ]
    stage_rows = [
        stage
        for stage in stage_rows
        if stage["status"] != "pending"
    ]

    visible_stage_ids = [stage["id"] for stage in stage_rows]
    comment_rows: list[dict] = []
    due_date_request_rows: list[dict] = []
    if visible_stage_ids:
        comment_rows = records_to_dicts(
            await connection.fetch(
                """
                SELECT
                    c.*,
                    COALESCE(NULLIF(p.full_name, ''), p.email, c.department) AS author_name
                FROM comments c
                LEFT JOIN profiles p ON p.id = c.user_id
                WHERE c.stage_id = ANY($1::uuid[])
                ORDER BY c.created_at ASC
                """,
                visible_stage_ids,
            )
        )
        due_date_request_rows = records_to_dicts(
            await connection.fetch(
                """
                SELECT
                    r.*,
                    COALESCE(NULLIF(requestor.full_name, ''), requestor.email, r.requested_by_department) AS requestor_name,
                    COALESCE(NULLIF(reviewer.full_name, ''), reviewer.email) AS reviewer_name
                FROM stage_due_date_change_requests r
                LEFT JOIN profiles requestor ON requestor.id = r.requested_by
                LEFT JOIN profiles reviewer ON reviewer.id = r.reviewed_by
                WHERE r.stage_id = ANY($1::uuid[])
                ORDER BY r.created_at DESC
                """,
                visible_stage_ids,
            )
        )
    document_rows = records_to_dicts(
        await connection.fetch(
            """
            SELECT
                d.*,
                COALESCE(NULLIF(p.full_name, ''), p.email) AS uploaded_by_name
            FROM project_documents d
            LEFT JOIN profiles p ON p.id = d.uploaded_by
            WHERE d.project_id = $1
            ORDER BY d.created_at DESC
            """,
            project_id,
        )
    )

    documents = await _build_project_documents(document_rows, settings)
    return _build_project_detail(
        _normalize_project_row(record_to_dict(project_row)),
        stage_rows,
        comment_rows,
        due_date_request_rows,
        documents,
    )


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
        normalized = _normalize_project_row(row)
        snapshot = None
        if normalized["current_stage_id"]:
            snapshot = StageSnapshot(
                id=normalized["current_stage_id"],
                name=normalized["current_stage_name"],
                phase=normalized["current_stage_phase"],
                responsible_dept=normalized["current_stage_dept"],
                status=normalized["current_stage_status"],
                activated_at=normalized["current_stage_activated_at"],
                due_date=normalized["current_stage_due_date"],
            )

        results.append(
            ProjectSummary(
                id=normalized["id"],
                project_code=normalized["project_code"],
                name=normalized["name"],
                client=normalized["client"],
                brand=normalized["brand"],
                assigned_person_name=normalized.get("assigned_person_name"),
                priority=normalized["priority"],
                estimated_tat_days=normalized["estimated_tat_days"],
                total_order_value=normalized["total_order_value"],
                number_of_stores=normalized["number_of_stores"],
                created_at=normalized["created_at"],
                is_archived=normalized["is_archived"],
                current_stage=snapshot,
            )
        )

    return results


@router.post("", response_model=ProjectDetail, status_code=status.HTTP_201_CREATED)
async def create_project(
    payload: ProjectCreate,
    background_tasks: BackgroundTasks = None,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
) -> ProjectDetail:
    try:
        async with transaction(pool) as connection:
            stage_blueprint = await load_stage_blueprint(connection)
            await set_audit_actor(connection, user.user_id)
            creator_profile = await connection.fetchrow(
                """
                SELECT COALESCE(NULLIF(full_name, ''), email) AS display_name, department
                FROM profiles
                WHERE id = $1
                """,
                user.user_id,
            )
            project = await connection.fetchrow(
                """
                INSERT INTO projects (
                    name,
                    client,
                    brand,
                    assigned_person_name,
                    priority,
                    estimated_tat_days,
                    total_order_value,
                    number_of_stores,
                    special_request,
                    created_by
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *
                """,
                payload.name,
                payload.client,
                payload.brand.strip() if payload.brand else None,
                payload.assigned_person_name.strip(),
                payload.priority.value,
                payload.estimated_tat_days,
                payload.total_order_value,
                payload.number_of_stores,
                payload.special_request.strip() if payload.special_request else None,
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
            recipient_rows = records_to_dicts(
                await connection.fetch(
                    """
                    SELECT DISTINCT email
                    FROM profiles
                    WHERE email IS NOT NULL
                      AND NULLIF(email, '') IS NOT NULL
                    ORDER BY email
                    """
                )
            )
    except UniqueViolationError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unable to allocate a unique project code. Please retry.",
        ) from exc

    project_dict = _normalize_project_row(record_to_dict(project)) or {}
    creator_name = None
    creator_department = user.department
    if creator_profile is not None:
        creator_name = creator_profile["display_name"]
        if creator_profile["department"]:
            creator_department = Department(creator_profile["department"])
    else:
        creator_name = user.email.split("@")[0] if user.email else None

    project_dict["created_by_name"] = creator_name
    project_dict["created_by_department"] = creator_department

    recipients = [row["email"] for row in recipient_rows if row.get("email")]
    first_stage_name = stage_rows[0]["name"] if stage_rows else "Workflow started"
    project_url = f"{settings.frontend_url.rstrip('/')}/projects/{project['id']}" if settings.frontend_url else None

    if recipients:
        notification_payload = {
            "project_code": project_dict["project_code"],
            "project_name": project_dict["name"],
            "client": project_dict["client"],
            "assigned_person_name": project_dict.get("assigned_person_name"),
            "priority": project_dict["priority"],
            "created_by_name": creator_name or "Workflow user",
            "created_by_department": creator_department.value,
            "estimated_tat_days": project_dict["estimated_tat_days"],
            "total_order_value": project_dict["total_order_value"],
            "special_request": project_dict.get("special_request"),
            "current_stage_name": first_stage_name,
            "recipients": recipients,
            "project_url": project_url,
        }
        if background_tasks is not None:
            background_tasks.add_task(_send_project_created_summary_task, settings, notification_payload)
        else:
            await _send_project_created_summary_task(settings, notification_payload)

    return _build_project_detail(project_dict, stage_rows, [], [], [])


@router.patch("/{project_id}", response_model=ProjectDetail)
async def update_project_metadata(
    project_id: UUID,
    payload: ProjectUpdate,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
) -> ProjectDetail:
    assigned_person_name = payload.assigned_person_name.strip()
    if not assigned_person_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned person is required.")

    special_request = payload.special_request.strip() if payload.special_request else None

    async with transaction(pool) as connection:
        await set_audit_actor(connection, user.user_id)
        updated_project = await connection.fetchrow(
            """
            UPDATE projects
            SET
                assigned_person_name = $2,
                priority = $3,
                estimated_tat_days = $4,
                total_order_value = $5,
                number_of_stores = $6,
                special_request = $7
            WHERE id = $1
              AND is_archived = FALSE
            RETURNING id
            """,
            project_id,
            assigned_person_name,
            payload.priority.value,
            payload.estimated_tat_days,
            payload.total_order_value,
            payload.number_of_stores,
            special_request,
        )
        if updated_project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

        return await load_project_detail(
            connection,
            project_id,
            settings=settings,
            viewer_department=user.department,
        )


@router.post("/{project_id}/documents", response_model=ProjectDocumentRead, status_code=status.HTTP_201_CREATED)
async def upload_project_document(
    project_id: UUID,
    document_type: ProjectDocumentType = Form(ProjectDocumentType.BOQ),
    file: UploadFile = File(...),
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
) -> ProjectDocumentRead:
    file_name = (file.filename or "").strip()
    if not file_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please select a file to upload.")

    if not is_supported_project_document(file_name):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Please upload PDF, CSV, Excel, DOC, image, text, or ZIP files.",
        )

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded file is empty.")

    if len(content) > settings.project_documents_max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File is too large. Maximum size is {settings.project_documents_max_bytes // (1024 * 1024)} MB.",
        )

    project = await pool.fetchrow(
        "SELECT id FROM projects WHERE id = $1 AND is_archived = FALSE",
        project_id,
    )
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    storage_bucket = settings.project_documents_bucket
    storage_path = build_project_document_path(project_id, file_name, document_type.value)
    content_type = file.content_type or "application/octet-stream"

    try:
        await upload_storage_object(
            settings,
            bucket=storage_bucket,
            path=storage_path,
            content=content,
            content_type=content_type,
        )
    except StorageServiceError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        async with transaction(pool) as connection:
            inserted = await connection.fetchrow(
                """
                WITH inserted AS (
                    INSERT INTO project_documents (
                        project_id,
                        document_type,
                        file_name,
                        storage_bucket,
                        storage_path,
                        content_type,
                        file_size,
                        uploaded_by
                    )
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                )
                SELECT
                    inserted.*,
                    COALESCE(NULLIF(p.full_name, ''), p.email) AS uploaded_by_name
                FROM inserted
                LEFT JOIN profiles p ON p.id = inserted.uploaded_by
                """,
                project_id,
                document_type.value,
                file_name,
                storage_bucket,
                storage_path,
                content_type,
                len(content),
                user.user_id,
            )
    except Exception:
        try:
            await delete_storage_object(settings, bucket=storage_bucket, path=storage_path)
        except StorageServiceError:
            pass
        raise

    download_url = None
    try:
        download_url = await create_signed_download_url(
            settings,
            bucket=storage_bucket,
            path=storage_path,
        )
    except StorageServiceError:
        download_url = None

    inserted_row = record_to_dict(inserted) or {}
    inserted_row["file_size"] = int(inserted_row["file_size"])
    return ProjectDocumentRead(**inserted_row, download_url=download_url)


@router.get("/{project_id}", response_model=ProjectDetail)
async def get_project(
    project_id: UUID,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(get_current_user),
) -> ProjectDetail:
    return await load_project_detail(
        pool,
        project_id,
        settings=settings,
        viewer_department=user.department,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_project(
    project_id: UUID,
    pool=Depends(get_pool),
    settings: Settings = Depends(get_settings),
    user: CurrentUser = Depends(require_departments(Department.ADMIN)),
) -> Response:
    if user.department != Department.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only Admin can delete projects.")

    document_rows: list[dict] = []
    project = None

    async with transaction(pool) as connection:
        project = await connection.fetchrow(
            """
            SELECT id, project_code, name
            FROM projects
            WHERE id = $1
              AND is_archived = FALSE
            """,
            project_id,
        )
        if project is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

        document_rows = records_to_dicts(
            await connection.fetch(
                """
                SELECT storage_bucket, storage_path
                FROM project_documents
                WHERE project_id = $1
                """,
                project_id,
            )
        )

        await set_audit_actor(connection, user.user_id)
        await connection.execute(
            """
            WITH stage_ids AS (
                SELECT id
                FROM stages
                WHERE project_id = $1
            ),
            comment_ids AS (
                SELECT c.id
                FROM comments c
                JOIN stage_ids s ON s.id = c.stage_id
            )
            DELETE FROM audit_log
            WHERE (table_name = 'stages' AND record_id IN (SELECT id FROM stage_ids))
               OR (table_name = 'comments' AND record_id IN (SELECT id FROM comment_ids))
            """,
            project_id,
        )
        await connection.execute("DELETE FROM projects WHERE id = $1", project_id)

    if document_rows:
        cleanup_results = await asyncio.gather(
            *[
                delete_storage_object(
                    settings,
                    bucket=row["storage_bucket"],
                    path=row["storage_path"],
                )
                for row in document_rows
            ],
            return_exceptions=True,
        )
        cleanup_errors = [result for result in cleanup_results if isinstance(result, Exception)]
        if cleanup_errors:
            logger.warning(
                "Project %s was deleted, but %s storage object(s) could not be removed.",
                project["project_code"] if project is not None else str(project_id),
                len(cleanup_errors),
            )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
            p.assigned_person_name,
            p.priority,
            p.estimated_tat_days,
            p.total_order_value,
            p.number_of_stores,
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
            "assigned_person_name",
            "priority",
            "estimated_tat_days",
            "total_order_value",
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
        normalized = _normalize_project_row(row) or {}
        writer.writerow(
            {
                "project_code": normalized["project_code"],
                "project_name": normalized["project_name"],
                "client": normalized["client"],
                "assigned_person_name": normalized["assigned_person_name"] or "",
                "priority": normalized["priority"].title(),
                "estimated_tat_days": normalized["estimated_tat_days"] or "",
                "total_order_value": f"{normalized['total_order_value']:.2f}"
                if normalized["total_order_value"] is not None
                else "",
                "project_status": _project_status_label(normalized["current_stage_status"]),
                "current_stage": normalized["current_stage_name"] or "",
                "current_phase": normalized["current_stage_phase"].title() if normalized["current_stage_phase"] else "",
                "responsible_department": normalized["current_stage_dept"] or "",
                "stage_status": _stage_status_label(normalized["current_stage_status"]),
                "due_date": normalized["current_stage_due_date"].isoformat() if normalized["current_stage_due_date"] else "",
                "eta": _eta_label(normalized["current_stage_due_date"], normalized["current_stage_status"]),
                "pending_duration": _format_pending_duration(normalized["current_stage_activated_at"])
                if normalized["current_stage_status"]
                else "Completed",
                "activated_at": normalized["current_stage_activated_at"].isoformat()
                if normalized["current_stage_activated_at"]
                else "",
                "created_at": normalized["created_at"].isoformat(),
            }
        )

    buffer.seek(0)
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="workflow-tracker-export.csv"'},
    )
