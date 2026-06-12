import logging

import resend

from config import Settings

logger = logging.getLogger(__name__)


class NotificationService:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings
        if settings.resend_api_key:
            resend.api_key = settings.resend_api_key

    async def send_overdue_alert(
        self,
        *,
        project_name: str,
        stage_name: str,
        recipients: list[str],
    ) -> None:
        if not recipients:
            logger.info("Skipping overdue alert for %s / %s because no recipients were configured.", project_name, stage_name)
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent overdue alert to %s.", ", ".join(recipients))
            return

        resend.Emails.send(
            {
                "from": "Workflow Tracker <alerts@kianfalcon.com>",
                "to": recipients,
                "subject": f"[OVERDUE] {project_name} - {stage_name}",
                "html": (
                    "<p>A workflow stage is overdue.</p>"
                    f"<p><strong>Project:</strong> {project_name}</p>"
                    f"<p><strong>Stage:</strong> {stage_name}</p>"
                ),
            }
        )
