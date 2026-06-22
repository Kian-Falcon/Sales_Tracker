from csv import writer
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse

from auth import require_departments
from database import get_pool, records_to_dicts, transaction
from models.common import CurrentUser, Department
from models.report import (
    MonthlyAuditEvent,
    MonthlyDepartmentReportRow,
    MonthlyProjectReportRow,
    MonthlyReportOverview,
    MonthlyReportRead,
    MonthlyReportTrendPoint,
)

router = APIRouter(prefix="/api/v1/reports", tags=["reports"])

REPORT_PROJECTS_CTE = """
WITH report_projects AS (
    SELECT DISTINCT
        p.id,
        p.project_code,
        p.name,
        p.client,
        p.brand,
        p.priority,
        p.assigned_person_name,
        p.total_order_value,
        p.number_of_stores,
        p.created_at
    FROM projects p
    WHERE p.is_archived = FALSE
      AND (
        (p.created_at >= $1::date AND p.created_at < $2::date)
        OR EXISTS (
            SELECT 1
            FROM stages s
            WHERE s.project_id = p.id
              AND (
                (
                    s.activated_at IS NOT NULL
                    AND s.activated_at::date < $2::date
                    AND COALESCE(s.completed_at::date, $2::date) >= $1::date
                )
                OR (s.completed_at IS NOT NULL AND s.completed_at >= $1::date AND s.completed_at < $2::date)
                OR (s.due_date IS NOT NULL AND s.due_date >= $1::date AND s.due_date < $2::date)
              )
        )
        OR EXISTS (
            SELECT 1
            FROM audit_log al
            JOIN stages s ON al.table_name = 'stages' AND s.id = al.record_id
            WHERE s.project_id = p.id
              AND al.changed_at >= $1::date
              AND al.changed_at < $2::date
        )
        OR EXISTS (
            SELECT 1
            FROM audit_log al
            JOIN comments c ON al.table_name = 'comments' AND c.id = al.record_id
            JOIN stages s ON s.id = c.stage_id
            WHERE s.project_id = p.id
              AND al.changed_at >= $1::date
              AND al.changed_at < $2::date
        )
      )
)
"""

DEPARTMENT_SORT_ORDER = {
    Department.SALES: 0,
    Department.RD: 1,
    Department.PRODUCTION: 2,
    Department.PROCUREMENT: 3,
    Department.QC: 4,
    Department.DISPATCH: 5,
    Department.ADMIN: 6,
}


def _assert_reports_access(user: CurrentUser) -> None:
    if user.department not in {Department.SALES, Department.ADMIN}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Sales or Admin can access reports.",
        )


def _parse_report_month(month: str | None) -> date:
    if month is None:
        today = date.today()
        return date(today.year, today.month, 1)

    try:
        year_str, month_str = month.split("-", maxsplit=1)
        parsed = date(int(year_str), int(month_str), 1)
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Month must be in YYYY-MM format.",
        ) from None

    return parsed


def _month_bounds(month_start: date) -> tuple[date, date]:
    if month_start.month == 12:
        next_month = date(month_start.year + 1, 1, 1)
    else:
        next_month = date(month_start.year, month_start.month + 1, 1)
    return month_start, next_month


def _completion_rate(completed: int, total: int) -> float:
    if total <= 0:
        return 0.0
    return round((completed / total) * 100, 1)


def _current_delay_days(current_stage_status: str | None, current_stage_due_date: date | None) -> int | None:
    if current_stage_due_date is None:
        return None

    diff_days = (date.today() - current_stage_due_date).days
    if current_stage_status == "overdue" or diff_days > 0:
        return diff_days if diff_days > 0 else 0

    return None


def _project_status_label(row: dict) -> str:
    if row.get("current_stage_status") == "overdue":
        return "Overdue"

    if row.get("completed_stages", 0) == row.get("total_stages", 0) and row.get("total_stages", 0) > 0:
        return "Completed"

    if row.get("current_stage_status") == "active":
        return "Active"

    return "Pending"


def _safe_float(value) -> float | None:
    if value is None:
        return None
    return float(value)


def _shorten_text(value: str | None, *, limit: int = 140) -> str:
    if not value:
        return ""

    collapsed = " ".join(value.split())
    if len(collapsed) <= limit:
        return collapsed

    return f"{collapsed[: limit - 1].rstrip()}..."


def _format_date_label(value: str | None) -> str:
    if not value:
        return "Not set"

    try:
        return date.fromisoformat(value).strftime("%d %b %Y")
    except ValueError:
        return value


def _build_audit_details(row: dict) -> str:
    if row["event_type"] == "Comment added":
        return _shorten_text(row.get("comment_text"), limit=160)

    old_status = row.get("old_status")
    new_status = row.get("new_status")
    old_due_date = row.get("old_due_date")
    new_due_date = row.get("new_due_date")

    details: list[str] = []
    if old_status != new_status:
        details.append(f"Status: {old_status or 'Not set'} -> {new_status or 'Not set'}")
    if old_due_date != new_due_date:
        details.append(
            f"Due date: {_format_date_label(old_due_date)} -> {_format_date_label(new_due_date)}"
        )

    return " | ".join(details) if details else "Stage metadata updated."


def _build_trend_rows(month_start: date, month_end_exclusive: date, event_rows: list[dict]) -> list[MonthlyReportTrendPoint]:
    weekly_ranges: list[tuple[date, date]] = []
    cursor = month_start
    while cursor < month_end_exclusive:
        week_end = min(cursor + timedelta(days=6), month_end_exclusive - timedelta(days=1))
        weekly_ranges.append((cursor, week_end))
        cursor = week_end + timedelta(days=1)

    buckets = {
        (week_start, week_end): {
            "project_created": 0,
            "stage_completed": 0,
            "overdue_event": 0,
            "comment_logged": 0,
        }
        for week_start, week_end in weekly_ranges
    }

    for row in event_rows:
        occurred_on = row["occurred_on"]
        for week_start, week_end in weekly_ranges:
            if week_start <= occurred_on <= week_end:
                buckets[(week_start, week_end)][row["event_type"]] += 1
                break

    trends: list[MonthlyReportTrendPoint] = []
    for index, (week_start, week_end) in enumerate(weekly_ranges, start=1):
        bucket = buckets[(week_start, week_end)]
        trends.append(
            MonthlyReportTrendPoint(
                label=f"Week {index}",
                period_start=week_start,
                period_end=week_end,
                projects_created=bucket["project_created"],
                stages_completed=bucket["stage_completed"],
                overdue_events=bucket["overdue_event"],
                comments_logged=bucket["comment_logged"],
            )
        )

    return trends


async def _build_monthly_report(connection, *, month_start: date, month_end_exclusive: date) -> MonthlyReportRead:
    project_rows = records_to_dicts(
        await connection.fetch(
            f"""
            {REPORT_PROJECTS_CTE},
            stage_counts AS (
                SELECT
                    s.project_id,
                    COUNT(*) AS total_stages,
                    COUNT(*) FILTER (WHERE s.status = 'done') AS completed_stages,
                    COUNT(*) FILTER (WHERE s.status = 'active') AS active_stages,
                    COUNT(*) FILTER (WHERE s.status = 'overdue') AS overdue_stages,
                    COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_stages,
                    COUNT(*) FILTER (
                        WHERE s.completed_at >= $1::date
                          AND s.completed_at < $2::date
                    ) AS completed_this_month
                FROM stages s
                JOIN report_projects rp ON rp.id = s.project_id
                GROUP BY s.project_id
            ),
            current_stage AS (
                SELECT DISTINCT ON (s.project_id)
                    s.project_id,
                    s.name AS current_stage_name,
                    s.responsible_dept AS current_stage_department,
                    s.status AS current_stage_status,
                    s.due_date AS current_stage_due_date
                FROM stages s
                JOIN report_projects rp ON rp.id = s.project_id
                WHERE s.status IN ('active', 'overdue')
                ORDER BY s.project_id, s.sort_order
            )
            SELECT
                rp.id AS project_id,
                rp.project_code,
                rp.name AS project_name,
                rp.client,
                rp.brand,
                rp.priority,
                rp.assigned_person_name,
                rp.total_order_value,
                rp.number_of_stores,
                rp.created_at,
                COALESCE(sc.total_stages, 0) AS total_stages,
                COALESCE(sc.completed_stages, 0) AS completed_stages,
                COALESCE(sc.active_stages, 0) AS active_stages,
                COALESCE(sc.overdue_stages, 0) AS overdue_stages,
                COALESCE(sc.pending_stages, 0) AS pending_stages,
                COALESCE(sc.completed_this_month, 0) AS completed_this_month,
                cs.current_stage_name,
                cs.current_stage_department,
                cs.current_stage_status,
                cs.current_stage_due_date
            FROM report_projects rp
            LEFT JOIN stage_counts sc ON sc.project_id = rp.id
            LEFT JOIN current_stage cs ON cs.project_id = rp.id
            ORDER BY
                CASE
                    WHEN cs.current_stage_status = 'overdue' THEN 0
                    WHEN cs.current_stage_status = 'active' THEN 1
                    ELSE 2
                END,
                rp.created_at DESC,
                rp.project_code
            """,
            month_start,
            month_end_exclusive,
        )
    )

    department_rows = records_to_dicts(
        await connection.fetch(
            f"""
            {REPORT_PROJECTS_CTE}
            SELECT
                s.responsible_dept AS department,
                COUNT(*) AS total_stages,
                COUNT(*) FILTER (WHERE s.status = 'done') AS completed_total,
                COUNT(*) FILTER (
                    WHERE s.completed_at >= $1::date
                      AND s.completed_at < $2::date
                ) AS completed_this_month,
                COUNT(*) FILTER (WHERE s.status = 'active') AS active_now,
                COUNT(*) FILTER (WHERE s.status = 'overdue') AS overdue_now,
                COUNT(*) FILTER (WHERE s.status = 'pending') AS pending_now,
                ROUND(
                    AVG(
                        CASE
                            WHEN s.completed_at IS NOT NULL
                             AND s.activated_at IS NOT NULL
                             AND s.completed_at >= $1::date
                             AND s.completed_at < $2::date
                            THEN EXTRACT(EPOCH FROM (s.completed_at - s.activated_at)) / 86400
                        END
                    )::numeric,
                    1
                ) AS avg_completion_days,
                ROUND(
                    AVG(
                        CASE
                            WHEN s.status = 'overdue' AND s.due_date IS NOT NULL
                            THEN GREATEST((CURRENT_DATE - s.due_date), 0)::numeric
                        END
                    ),
                    1
                ) AS avg_delay_days
            FROM stages s
            JOIN report_projects rp ON rp.id = s.project_id
            GROUP BY s.responsible_dept
            """,
            month_start,
            month_end_exclusive,
        )
    )

    trend_event_rows = records_to_dicts(
        await connection.fetch(
            f"""
            {REPORT_PROJECTS_CTE}
            SELECT 'project_created' AS event_type, rp.created_at::date AS occurred_on
            FROM report_projects rp
            WHERE rp.created_at >= $1::date
              AND rp.created_at < $2::date

            UNION ALL

            SELECT 'stage_completed' AS event_type, s.completed_at::date AS occurred_on
            FROM stages s
            JOIN report_projects rp ON rp.id = s.project_id
            WHERE s.completed_at >= $1::date
              AND s.completed_at < $2::date

            UNION ALL

            SELECT 'overdue_event' AS event_type, al.changed_at::date AS occurred_on
            FROM audit_log al
            JOIN stages s ON s.id = al.record_id
            JOIN report_projects rp ON rp.id = s.project_id
            WHERE al.table_name = 'stages'
              AND al.changed_at >= $1::date
              AND al.changed_at < $2::date
              AND COALESCE(al.old_data->>'status', '') IS DISTINCT FROM COALESCE(al.new_data->>'status', '')
              AND al.new_data->>'status' = 'overdue'

            UNION ALL

            SELECT 'comment_logged' AS event_type, al.changed_at::date AS occurred_on
            FROM audit_log al
            JOIN comments c ON c.id = al.record_id
            JOIN stages s ON s.id = c.stage_id
            JOIN report_projects rp ON rp.id = s.project_id
            WHERE al.table_name = 'comments'
              AND al.changed_at >= $1::date
              AND al.changed_at < $2::date
            """,
            month_start,
            month_end_exclusive,
        )
    )

    audit_rows = records_to_dicts(
        await connection.fetch(
            f"""
            {REPORT_PROJECTS_CTE}
            SELECT *
            FROM (
                SELECT
                    al.id AS event_id,
                    al.changed_at,
                    rp.id AS project_id,
                    rp.project_code,
                    rp.name AS project_name,
                    COALESCE(al.new_data->>'name', al.old_data->>'name', s.name) AS stage_name,
                    CASE
                        WHEN al.old_data->>'status' IS DISTINCT FROM al.new_data->>'status'
                         AND al.old_data->>'due_date' IS DISTINCT FROM al.new_data->>'due_date'
                        THEN 'Stage status and due date updated'
                        WHEN al.old_data->>'status' IS DISTINCT FROM al.new_data->>'status'
                        THEN 'Stage status updated'
                        WHEN al.old_data->>'due_date' IS DISTINCT FROM al.new_data->>'due_date'
                        THEN 'Stage due date updated'
                        ELSE 'Stage updated'
                    END AS event_type,
                    COALESCE(
                        NULLIF(pr.full_name, ''),
                        pr.email,
                        CASE WHEN al.changed_by IS NULL THEN 'System' ELSE 'Workflow user' END
                    ) AS actor_name,
                    pr.email AS actor_email,
                    al.old_data->>'status' AS old_status,
                    al.new_data->>'status' AS new_status,
                    al.old_data->>'due_date' AS old_due_date,
                    al.new_data->>'due_date' AS new_due_date,
                    NULL::text AS comment_text
                FROM audit_log al
                JOIN stages s ON s.id = al.record_id
                JOIN report_projects rp ON rp.id = s.project_id
                LEFT JOIN profiles pr ON pr.id = al.changed_by
                WHERE al.table_name = 'stages'
                  AND al.changed_at >= $1::date
                  AND al.changed_at < $2::date
                  AND (
                      (al.old_data->>'status' IS DISTINCT FROM al.new_data->>'status')
                      OR (al.old_data->>'due_date' IS DISTINCT FROM al.new_data->>'due_date')
                  )

                UNION ALL

                SELECT
                    al.id AS event_id,
                    al.changed_at,
                    rp.id AS project_id,
                    rp.project_code,
                    rp.name AS project_name,
                    s.name AS stage_name,
                    'Comment added' AS event_type,
                    COALESCE(
                        NULLIF(pr.full_name, ''),
                        pr.email,
                        CASE WHEN al.changed_by IS NULL THEN 'System' ELSE 'Workflow user' END
                    ) AS actor_name,
                    pr.email AS actor_email,
                    NULL::text AS old_status,
                    NULL::text AS new_status,
                    NULL::text AS old_due_date,
                    NULL::text AS new_due_date,
                    c.text AS comment_text
                FROM audit_log al
                JOIN comments c ON c.id = al.record_id
                JOIN stages s ON s.id = c.stage_id
                JOIN report_projects rp ON rp.id = s.project_id
                LEFT JOIN profiles pr ON pr.id = al.changed_by
                WHERE al.table_name = 'comments'
                  AND al.changed_at >= $1::date
                  AND al.changed_at < $2::date
            ) recent_events
            ORDER BY changed_at DESC
            LIMIT 40
            """,
            month_start,
            month_end_exclusive,
        )
    )

    projects: list[MonthlyProjectReportRow] = []
    for row in project_rows:
        total_stages = row["total_stages"]
        completed_stages = row["completed_stages"]
        projects.append(
            MonthlyProjectReportRow(
                project_id=row["project_id"],
                project_code=row["project_code"],
                project_name=row["project_name"],
                client=row["client"],
                brand=row["brand"],
                priority=row["priority"],
                assigned_person_name=row["assigned_person_name"],
                total_order_value=_safe_float(row["total_order_value"]),
                number_of_stores=row["number_of_stores"],
                created_at=row["created_at"],
                status_label=_project_status_label(row),
                current_stage_name=row["current_stage_name"],
                current_stage_department=row["current_stage_department"],
                current_stage_status=row["current_stage_status"],
                current_stage_due_date=row["current_stage_due_date"],
                total_stages=total_stages,
                completed_stages=completed_stages,
                active_stages=row["active_stages"],
                overdue_stages=row["overdue_stages"],
                pending_stages=row["pending_stages"],
                completed_this_month=row["completed_this_month"],
                completion_rate=_completion_rate(completed_stages, total_stages),
                current_delay_days=_current_delay_days(
                    row["current_stage_status"],
                    row["current_stage_due_date"],
                ),
            )
        )

    departments: list[MonthlyDepartmentReportRow] = []
    for row in sorted(
        department_rows,
        key=lambda item: DEPARTMENT_SORT_ORDER.get(Department(item["department"]), 99),
    ):
        total_stages = row["total_stages"]
        completed_total = row["completed_total"]
        departments.append(
            MonthlyDepartmentReportRow(
                department=row["department"],
                total_stages=total_stages,
                completed_total=completed_total,
                completed_this_month=row["completed_this_month"],
                active_now=row["active_now"],
                overdue_now=row["overdue_now"],
                pending_now=row["pending_now"],
                completion_rate=_completion_rate(completed_total, total_stages),
                avg_completion_days=_safe_float(row["avg_completion_days"]),
                avg_delay_days=_safe_float(row["avg_delay_days"]),
            )
        )

    trends = _build_trend_rows(month_start, month_end_exclusive, trend_event_rows)

    audit_events = [
        MonthlyAuditEvent(
            event_id=row["event_id"],
            changed_at=row["changed_at"],
            project_id=row["project_id"],
            project_code=row["project_code"],
            project_name=row["project_name"],
            stage_name=row["stage_name"],
            event_type=row["event_type"],
            actor_name=row["actor_name"],
            actor_email=row["actor_email"],
            details=_build_audit_details(row),
        )
        for row in audit_rows
    ]

    overview = MonthlyReportOverview(
        projects_in_scope=len(projects),
        projects_created=sum(1 for project in projects if month_start <= project.created_at.date() < month_end_exclusive),
        active_projects=sum(1 for project in projects if project.status_label == "Active"),
        overdue_projects=sum(1 for project in projects if project.status_label == "Overdue"),
        completed_projects=sum(1 for project in projects if project.status_label == "Completed"),
        stages_completed=sum(project.completed_this_month for project in projects),
        overdue_events=sum(point.overdue_events for point in trends),
        comments_logged=sum(point.comments_logged for point in trends),
        total_pipeline_value=round(
            sum(project.total_order_value or 0 for project in projects),
            2,
        ),
        stores_in_scope=sum(project.number_of_stores or 0 for project in projects),
    )

    return MonthlyReportRead(
        month=month_start.strftime("%Y-%m"),
        period_start=month_start,
        period_end=month_end_exclusive - timedelta(days=1),
        generated_at=datetime.now(timezone.utc),
        overview=overview,
        departments=departments,
        projects=projects,
        trends=trends,
        audit_events=audit_events,
    )


@router.get("/monthly", response_model=MonthlyReportRead)
async def get_monthly_report(
    month: str | None = None,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
) -> MonthlyReportRead:
    _assert_reports_access(user)
    month_start = _parse_report_month(month)
    _, month_end_exclusive = _month_bounds(month_start)

    async with transaction(pool) as connection:
        return await _build_monthly_report(
            connection,
            month_start=month_start,
            month_end_exclusive=month_end_exclusive,
        )


@router.get("/monthly/export/csv")
async def export_monthly_report_csv(
    month: str | None = None,
    pool=Depends(get_pool),
    user: CurrentUser = Depends(require_departments(Department.SALES, Department.ADMIN)),
):
    _assert_reports_access(user)
    month_start = _parse_report_month(month)
    _, month_end_exclusive = _month_bounds(month_start)

    async with transaction(pool) as connection:
        report = await _build_monthly_report(
            connection,
            month_start=month_start,
            month_end_exclusive=month_end_exclusive,
        )

    buffer = StringIO()
    csv_writer = writer(buffer)

    csv_writer.writerow(["Monthly workflow report", report.month])
    csv_writer.writerow(["Period", report.period_start.isoformat(), report.period_end.isoformat()])
    csv_writer.writerow(["Generated at", report.generated_at.isoformat()])
    csv_writer.writerow([])

    csv_writer.writerow(["Overview"])
    csv_writer.writerow(["metric", "value"])
    csv_writer.writerow(["Projects in scope", report.overview.projects_in_scope])
    csv_writer.writerow(["Projects created", report.overview.projects_created])
    csv_writer.writerow(["Active projects", report.overview.active_projects])
    csv_writer.writerow(["Overdue projects", report.overview.overdue_projects])
    csv_writer.writerow(["Completed projects", report.overview.completed_projects])
    csv_writer.writerow(["Stages completed", report.overview.stages_completed])
    csv_writer.writerow(["Overdue events", report.overview.overdue_events])
    csv_writer.writerow(["Comments logged", report.overview.comments_logged])
    csv_writer.writerow(["Total pipeline value", report.overview.total_pipeline_value])
    csv_writer.writerow(["Stores in scope", report.overview.stores_in_scope])
    csv_writer.writerow([])

    csv_writer.writerow(["Departments"])
    csv_writer.writerow(
        [
            "department",
            "total_stages",
            "completed_total",
            "completed_this_month",
            "active_now",
            "overdue_now",
            "pending_now",
            "completion_rate",
            "avg_completion_days",
            "avg_delay_days",
        ]
    )
    for department in report.departments:
        csv_writer.writerow(
            [
                department.department.value,
                department.total_stages,
                department.completed_total,
                department.completed_this_month,
                department.active_now,
                department.overdue_now,
                department.pending_now,
                department.completion_rate,
                department.avg_completion_days,
                department.avg_delay_days,
            ]
        )
    csv_writer.writerow([])

    csv_writer.writerow(["Projects"])
    csv_writer.writerow(
        [
            "project_code",
            "project_name",
            "client",
            "brand",
            "priority",
            "assigned_person_name",
            "total_order_value",
            "number_of_stores",
            "status_label",
            "current_stage_name",
            "current_stage_department",
            "current_stage_status",
            "current_stage_due_date",
            "completed_stages",
            "total_stages",
            "active_stages",
            "overdue_stages",
            "pending_stages",
            "completed_this_month",
            "completion_rate",
            "current_delay_days",
            "created_at",
        ]
    )
    for project in report.projects:
        csv_writer.writerow(
            [
                project.project_code,
                project.project_name,
                project.client,
                project.brand,
                project.priority.value,
                project.assigned_person_name,
                project.total_order_value,
                project.number_of_stores,
                project.status_label,
                project.current_stage_name,
                project.current_stage_department.value if project.current_stage_department else None,
                project.current_stage_status,
                project.current_stage_due_date.isoformat() if project.current_stage_due_date else None,
                project.completed_stages,
                project.total_stages,
                project.active_stages,
                project.overdue_stages,
                project.pending_stages,
                project.completed_this_month,
                project.completion_rate,
                project.current_delay_days,
                project.created_at.isoformat(),
            ]
        )
    csv_writer.writerow([])

    csv_writer.writerow(["Weekly trends"])
    csv_writer.writerow(
        [
            "label",
            "period_start",
            "period_end",
            "projects_created",
            "stages_completed",
            "overdue_events",
            "comments_logged",
        ]
    )
    for trend in report.trends:
        csv_writer.writerow(
            [
                trend.label,
                trend.period_start.isoformat(),
                trend.period_end.isoformat(),
                trend.projects_created,
                trend.stages_completed,
                trend.overdue_events,
                trend.comments_logged,
            ]
        )
    csv_writer.writerow([])

    csv_writer.writerow(["Audit feed"])
    csv_writer.writerow(
        [
            "changed_at",
            "event_type",
            "project_code",
            "project_name",
            "stage_name",
            "actor_name",
            "actor_email",
            "details",
        ]
    )
    for event in report.audit_events:
        csv_writer.writerow(
            [
                event.changed_at.isoformat(),
                event.event_type,
                event.project_code,
                event.project_name,
                event.stage_name,
                event.actor_name,
                event.actor_email,
                event.details,
            ]
        )

    buffer.seek(0)
    filename = f"workflow-report-{report.month}.csv"
    return StreamingResponse(
        iter([buffer.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
