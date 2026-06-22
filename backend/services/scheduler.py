import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from config import get_settings
from database import transaction
from models.common import Department
from services.notification import NotificationService

logger = logging.getLogger(__name__)


async def _list_reminder_recipients(
    connection,
    responsible_department: str,
    recipient_cache: dict[str, list[str]],
) -> list[str]:
    if responsible_department in recipient_cache:
        return recipient_cache[responsible_department]

    rows = await connection.fetch(
        """
        SELECT DISTINCT email
        FROM profiles
        WHERE email IS NOT NULL
          AND NULLIF(email, '') IS NOT NULL
          AND department = ANY($1::text[])
        ORDER BY email
        """,
        [
            responsible_department,
            Department.SALES.value,
            Department.ADMIN.value,
        ],
    )
    recipients = [row["email"] for row in rows if row["email"]]
    recipient_cache[responsible_department] = recipients
    return recipients


async def flag_overdue_stages(app: FastAPI) -> None:
    pool = getattr(app.state, "db_pool", None)
    if pool is None:
        logger.debug("Skipping overdue-stage scan because the database pool is not configured.")
        return

    settings = get_settings()
    notifier = NotificationService(settings)

    async with transaction(pool) as connection:
        rows = await connection.fetch(
            """
            SELECT s.id, s.name AS stage_name, p.name AS project_name
            FROM stages s
            JOIN projects p ON p.id = s.project_id
            WHERE s.due_date < CURRENT_DATE
              AND s.status IN ('active', 'overdue')
              AND NOT EXISTS (
                SELECT 1
                FROM notifications_log n
                WHERE n.stage_id = s.id
                  AND n.sent_on = CURRENT_DATE
              )
            """
        )

        for row in rows:
            await connection.execute(
                """
                UPDATE stages
                SET status = 'overdue'
                WHERE id = $1
                """,
                row["id"],
            )

            await notifier.send_overdue_alert(
                project_name=row["project_name"],
                stage_name=row["stage_name"],
                recipients=settings.default_alert_recipients,
            )

            await connection.execute(
                """
                INSERT INTO notifications_log (stage_id, sent_on, sent_to)
                VALUES ($1, $2, $3)
                ON CONFLICT (stage_id, sent_on) DO NOTHING
                """,
                row["id"],
                date.today(),
                settings.default_alert_recipients,
            )


async def send_stage_deadline_reminders(app: FastAPI) -> None:
    pool = getattr(app.state, "db_pool", None)
    if pool is None:
        logger.debug("Skipping deadline reminder scan because the database pool is not configured.")
        return

    settings = get_settings()
    reminder_offsets = settings.stage_reminder_offsets
    if not reminder_offsets:
        logger.debug("Skipping deadline reminder scan because no reminder offsets were configured.")
        return

    notifier = NotificationService(settings)
    recipient_cache: dict[str, list[str]] = {}

    async with transaction(pool) as connection:
        rows = await connection.fetch(
            """
            SELECT
                s.id,
                s.name AS stage_name,
                s.due_date,
                s.responsible_dept,
                p.id AS project_id,
                p.project_code,
                p.name AS project_name,
                (s.due_date - CURRENT_DATE) AS days_until_due
            FROM stages s
            JOIN projects p ON p.id = s.project_id
            WHERE p.is_archived = FALSE
              AND s.status = 'active'
              AND s.due_date IS NOT NULL
              AND s.due_date >= CURRENT_DATE
              AND (s.due_date - CURRENT_DATE) = ANY($1::int[])
              AND NOT EXISTS (
                SELECT 1
                FROM stage_deadline_reminder_log r
                WHERE r.stage_id = s.id
                  AND r.reminder_days_before = (s.due_date - CURRENT_DATE)
                  AND r.sent_on = CURRENT_DATE
              )
            ORDER BY s.due_date, p.created_at
            """,
            reminder_offsets,
        )

        for row in rows:
            recipients = await _list_reminder_recipients(
                connection,
                row["responsible_dept"],
                recipient_cache,
            )

            await notifier.send_stage_deadline_reminder(
                project_code=row["project_code"],
                project_name=row["project_name"],
                stage_name=row["stage_name"],
                due_date=row["due_date"],
                days_until_due=row["days_until_due"],
                responsible_department=row["responsible_dept"],
                recipients=recipients,
                project_url=f"{settings.frontend_url.rstrip('/')}/projects/{row['project_id']}" if settings.frontend_url else None,
            )

            await connection.execute(
                """
                INSERT INTO stage_deadline_reminder_log (
                    stage_id,
                    reminder_days_before,
                    sent_on,
                    sent_to
                )
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (stage_id, reminder_days_before, sent_on) DO NOTHING
                """,
                row["id"],
                row["days_until_due"],
                date.today(),
                recipients,
            )


def build_scheduler(app: FastAPI) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(flag_overdue_stages, "interval", minutes=30, args=[app], id="overdue-scan", replace_existing=True)
    scheduler.add_job(
        send_stage_deadline_reminders,
        "interval",
        minutes=30,
        args=[app],
        id="deadline-reminder-scan",
        replace_existing=True,
    )
    return scheduler
