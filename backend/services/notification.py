import logging
from datetime import date
from html import escape

import resend

from config import Settings

logger = logging.getLogger(__name__)


def _format_date(value: date | None) -> str:
    if value is None:
        return "Not set"

    return value.strftime("%d %b %Y")


def _format_deadline_label(days_until_due: int) -> str:
    if days_until_due == 1:
        return "1 day"

    return f"{days_until_due} days"


def _format_handoff_status_label(status: str) -> str:
    return status.replace("_", " ")


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
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[OVERDUE] {project_name} - {stage_name}",
                "html": (
                    "<p>A workflow stage is overdue.</p>"
                    f"<p><strong>Project:</strong> {project_name}</p>"
                    f"<p><strong>Stage:</strong> {stage_name}</p>"
                ),
            }
        )

    async def send_project_created_summary(
        self,
        *,
        project_code: str,
        project_name: str,
        client: str,
        brand: str | None,
        assigned_person_name: str | None,
        priority: str,
        created_by_name: str,
        created_by_department: str,
        estimated_tat_days: int,
        total_order_value: float,
        number_of_stores: int,
        special_request: str | None,
        current_stage_name: str,
        recipients: list[str],
        project_url: str | None = None,
    ) -> None:
        if not recipients:
            logger.info("Skipping new-project summary for %s because no recipients were configured.", project_code)
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent new-project summary to %s.", ", ".join(recipients))
            return

        project_link = (
            f'<p><a href="{escape(project_url)}" '
            'style="display:inline-block;padding:10px 16px;border-radius:999px;'
            'background:#111111;color:#ffffff;text-decoration:none;font-weight:600;">Open project</a></p>'
            if project_url
            else ""
        )
        special_request_html = (
            f"<p><strong>Special request:</strong> {escape(special_request)}</p>"
            if special_request
            else ""
        )

        resend.Emails.send(
            {
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[NEW PROJECT] {project_code} - {project_name}",
                "html": (
                    "<p>A new workflow project has been created and is now live in the tracker.</p>"
                    f"<p><strong>Project code:</strong> {escape(project_code)}</p>"
                    f"<p><strong>Project:</strong> {escape(project_name)}</p>"
                    f"<p><strong>Client:</strong> {escape(client)}</p>"
                    f"<p><strong>Brand:</strong> {escape(brand or 'Not set')}</p>"
                    f"<p><strong>Assigned person:</strong> {escape(assigned_person_name or 'Unassigned')}</p>"
                    f"<p><strong>Priority:</strong> {escape(priority.title())}</p>"
                    f"<p><strong>Created by:</strong> {escape(created_by_name)} ({escape(created_by_department)})</p>"
                    f"<p><strong>Estimated TAT:</strong> {estimated_tat_days} day(s)</p>"
                    f"<p><strong>Total order value:</strong> INR {total_order_value:,.2f}</p>"
                    f"<p><strong>Number of stores:</strong> {number_of_stores}</p>"
                    f"<p><strong>Current active stage:</strong> {escape(current_stage_name)}</p>"
                    f"{special_request_html}"
                    "<p><strong>BOQ:</strong> Uploads can be reviewed inside the tracker documents panel.</p>"
                    f"{project_link}"
                ),
            }
        )

    async def send_due_date_change_request(
        self,
        *,
        project_code: str,
        project_name: str,
        stage_name: str,
        current_due_date: date | None,
        requested_due_date: date,
        requested_by_name: str,
        requested_by_department: str,
        reason: str,
        recipients: list[str],
        project_url: str | None = None,
    ) -> None:
        if not recipients:
            logger.info("Skipping due-date request email for %s / %s because no recipients were configured.", project_code, stage_name)
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent due-date request email to %s.", ", ".join(recipients))
            return

        project_link = (
            f'<p><a href="{escape(project_url)}" '
            'style="display:inline-block;padding:10px 16px;border-radius:999px;'
            'background:#111111;color:#ffffff;text-decoration:none;font-weight:600;">Review request</a></p>'
            if project_url
            else ""
        )

        resend.Emails.send(
            {
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[DUE DATE REQUEST] {project_code} - {stage_name}",
                "html": (
                    "<p>A department has requested a due-date change for an active workflow stage.</p>"
                    f"<p><strong>Project code:</strong> {escape(project_code)}</p>"
                    f"<p><strong>Project:</strong> {escape(project_name)}</p>"
                    f"<p><strong>Stage:</strong> {escape(stage_name)}</p>"
                    f"<p><strong>Current due date:</strong> {_format_date(current_due_date)}</p>"
                    f"<p><strong>Requested due date:</strong> {_format_date(requested_due_date)}</p>"
                    f"<p><strong>Requested by:</strong> {escape(requested_by_name)} ({escape(requested_by_department)})</p>"
                    f"<p><strong>Reason:</strong> {escape(reason)}</p>"
                    f"{project_link}"
                ),
            }
        )

    async def send_due_date_change_resolution(
        self,
        *,
        project_code: str,
        project_name: str,
        stage_name: str,
        status: str,
        previous_due_date: date | None,
        requested_due_date: date,
        requested_by_name: str,
        reviewed_by_name: str,
        reason: str,
        review_note: str | None,
        recipients: list[str],
        project_url: str | None = None,
    ) -> None:
        if not recipients:
            logger.info("Skipping due-date resolution email for %s / %s because no recipients were configured.", project_code, stage_name)
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent due-date resolution email to %s.", ", ".join(recipients))
            return

        decision = "approved" if status == "approved" else "rejected"
        note_html = f"<p><strong>Review note:</strong> {escape(review_note)}</p>" if review_note else ""
        project_link = (
            f'<p><a href="{escape(project_url)}" '
            'style="display:inline-block;padding:10px 16px;border-radius:999px;'
            'background:#111111;color:#ffffff;text-decoration:none;font-weight:600;">Open project</a></p>'
            if project_url
            else ""
        )

        resend.Emails.send(
            {
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[DUE DATE {decision.upper()}] {project_code} - {stage_name}",
                "html": (
                    f"<p>The due-date change request for <strong>{escape(stage_name)}</strong> was {decision}.</p>"
                    f"<p><strong>Project code:</strong> {escape(project_code)}</p>"
                    f"<p><strong>Project:</strong> {escape(project_name)}</p>"
                    f"<p><strong>Previous due date:</strong> {_format_date(previous_due_date)}</p>"
                    f"<p><strong>Requested due date:</strong> {_format_date(requested_due_date)}</p>"
                    f"<p><strong>Requested by:</strong> {escape(requested_by_name)}</p>"
                    f"<p><strong>Reviewed by:</strong> {escape(reviewed_by_name)}</p>"
                    f"<p><strong>Original reason:</strong> {escape(reason)}</p>"
                    f"{note_html}"
                    f"{project_link}"
                ),
            }
        )

    async def send_stage_deadline_reminder(
        self,
        *,
        project_code: str,
        project_name: str,
        stage_name: str,
        due_date: date,
        days_until_due: int,
        responsible_department: str,
        recipients: list[str],
        project_url: str | None = None,
    ) -> None:
        if not recipients:
            logger.info(
                "Skipping deadline reminder for %s / %s because no recipients were configured.",
                project_code,
                stage_name,
            )
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent deadline reminder to %s.", ", ".join(recipients))
            return

        reminder_label = _format_deadline_label(days_until_due)
        project_link = (
            f'<p><a href="{escape(project_url)}" '
            'style="display:inline-block;padding:10px 16px;border-radius:999px;'
            'background:#111111;color:#ffffff;text-decoration:none;font-weight:600;">Open project</a></p>'
            if project_url
            else ""
        )

        resend.Emails.send(
            {
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[REMINDER] {project_code} - {stage_name} due in {reminder_label}",
                "html": (
                    "<p>A workflow stage deadline is approaching.</p>"
                    f"<p><strong>Project code:</strong> {escape(project_code)}</p>"
                    f"<p><strong>Project:</strong> {escape(project_name)}</p>"
                    f"<p><strong>Stage:</strong> {escape(stage_name)}</p>"
                    f"<p><strong>Responsible department:</strong> {escape(responsible_department)}</p>"
                    f"<p><strong>Due date:</strong> {_format_date(due_date)}</p>"
                    f"<p><strong>Reminder window:</strong> {escape(reminder_label)} before deadline</p>"
                    f"{project_link}"
                ),
            }
        )

    async def send_stage_handoff_notification(
        self,
        *,
        project_code: str,
        project_name: str,
        completed_stage_name: str,
        completed_stage_department: str,
        next_stage_name: str,
        next_stage_department: str,
        due_date: date | None,
        handoff_status: str,
        recipients: list[str],
        project_url: str | None = None,
    ) -> None:
        if not recipients:
            logger.info(
                "Skipping stage handoff notification for %s / %s because no recipients were configured.",
                project_code,
                next_stage_name,
            )
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent stage handoff notification to %s.", ", ".join(recipients))
            return

        handoff_label = _format_handoff_status_label(handoff_status)
        project_link = (
            f'<p><a href="{escape(project_url)}" '
            'style="display:inline-block;padding:10px 16px;border-radius:999px;'
            'background:#111111;color:#ffffff;text-decoration:none;font-weight:600;">Open project</a></p>'
            if project_url
            else ""
        )

        resend.Emails.send(
            {
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[HANDOFF] {project_code} - {next_stage_name} ({handoff_label})",
                "html": (
                    "<p>The previous workflow stage has been completed and your team is now up next.</p>"
                    f"<p><strong>Project code:</strong> {escape(project_code)}</p>"
                    f"<p><strong>Project:</strong> {escape(project_name)}</p>"
                    f"<p><strong>Completed stage:</strong> {escape(completed_stage_name)}</p>"
                    f"<p><strong>Completed stage department:</strong> {escape(completed_stage_department)}</p>"
                    f"<p><strong>Next active stage:</strong> {escape(next_stage_name)}</p>"
                    f"<p><strong>Next stage department:</strong> {escape(next_stage_department)}</p>"
                    f"<p><strong>Completion timing:</strong> {escape(handoff_label)}</p>"
                    f"<p><strong>Next stage due date:</strong> {_format_date(due_date)}</p>"
                    f"{project_link}"
                ),
            }
        )

    async def send_comment_mention(
        self,
        *,
        project_code: str,
        project_name: str,
        stage_name: str,
        author_name: str,
        author_department: str,
        comment_text: str,
        recipients: list[str],
        project_url: str | None = None,
    ) -> None:
        if not recipients:
            logger.info(
                "Skipping comment mention notification for %s / %s because no recipients were configured.",
                project_code,
                stage_name,
            )
            return

        if not self._settings.resend_api_key:
            logger.info("Resend is not configured. Would have sent comment mention notification to %s.", ", ".join(recipients))
            return

        project_link = (
            f'<p><a href="{escape(project_url)}" '
            'style="display:inline-block;padding:10px 16px;border-radius:999px;'
            'background:#111111;color:#ffffff;text-decoration:none;font-weight:600;">Open discussion</a></p>'
            if project_url
            else ""
        )
        comment_html = escape(comment_text).replace("\n", "<br>")

        resend.Emails.send(
            {
                "from": self._settings.email_from,
                "to": recipients,
                "subject": f"[MENTION] {project_code} - {stage_name}",
                "html": (
                    "<p>You were mentioned in a workflow stage comment.</p>"
                    f"<p><strong>Project code:</strong> {escape(project_code)}</p>"
                    f"<p><strong>Project:</strong> {escape(project_name)}</p>"
                    f"<p><strong>Stage:</strong> {escape(stage_name)}</p>"
                    f"<p><strong>Mentioned by:</strong> {escape(author_name)} ({escape(author_department)})</p>"
                    f"<p><strong>Comment:</strong><br>{comment_html}</p>"
                    f"{project_link}"
                ),
            }
        )
