import logging
from datetime import date

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI

from config import get_settings
from database import transaction
from services.notification import NotificationService

logger = logging.getLogger(__name__)


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


def build_scheduler(app: FastAPI) -> AsyncIOScheduler:
    scheduler = AsyncIOScheduler(timezone="Asia/Kolkata")
    scheduler.add_job(flag_overdue_stages, "interval", minutes=30, args=[app], id="overdue-scan", replace_existing=True)
    return scheduler
