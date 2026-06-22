import asyncio
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from io import BytesIO
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from starlette.datastructures import UploadFile

from config import Settings
from models.comment import CommentCreate
from models.common import CurrentUser, Department, ProjectDocumentType, ProjectPriority, StagePhase, StageStatus
from models.project import ProjectCreate, ProjectUpdate
from models.stage import (
    StageDueDateChangeRequestCreate,
    StageDueDateChangeRequestReview,
    StageDueDateUpdate,
    StageTemplate,
)
from models.workflow_settings import WorkflowStageSettingUpdate, WorkflowStageSettingUpdateRequest
from routers import comments, projects, reports, stages, workflow_settings
import services.scheduler as scheduler_service
from services.stage_templates import DEFAULT_STAGE_BLUEPRINT


def run_async(coro):
    return asyncio.run(coro)


def make_user(department: Department) -> CurrentUser:
    return CurrentUser(
        user_id=uuid4(),
        department=department,
        email=f"{department.name.lower()}@example.com",
    )


def patch_transaction(monkeypatch, module, connection) -> None:
    @asynccontextmanager
    async def fake_transaction(_pool):
        yield connection

    monkeypatch.setattr(module, "transaction", fake_transaction)


def patch_audit_actor(monkeypatch, module, calls: list | None = None) -> None:
    async def fake_set_audit_actor(_connection, user_id) -> None:
        if calls is not None:
            calls.append(user_id)

    monkeypatch.setattr(module, "set_audit_actor", fake_set_audit_actor)


class CreateProjectConnection:
    def __init__(self) -> None:
        self.project_id = uuid4()
        self.project = None
        self.stages: list[dict] = []
        self.recipients = [{"email": "sales@example.com"}, {"email": "rd@example.com"}]
        self.creator_profile = {"display_name": "Sales Lead", "department": Department.SALES.value}

    async def fetchrow(self, sql: str, *args):
        if "FROM profiles" in sql and "display_name" in sql:
            return self.creator_profile

        if "INSERT INTO projects" in sql:
            self.project = {
                "id": self.project_id,
                "project_code": "P0001",
                "name": args[0],
                "client": args[1],
                "brand": args[2],
                "assigned_person_name": args[3],
                "priority": args[4],
                "estimated_tat_days": args[5],
                "total_order_value": args[6],
                "number_of_stores": args[7],
                "special_request": args[8],
                "created_by": args[9],
                "created_at": datetime.now(timezone.utc),
                "is_archived": False,
            }
            return self.project

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def execute(self, sql: str, *args):
        if "INSERT INTO stages" in sql:
            self.stages.append(
                {
                    "id": uuid4(),
                    "project_id": args[0],
                    "stage_key": args[1],
                    "phase": args[2],
                    "name": args[3],
                    "responsible_dept": args[4],
                    "status": args[5],
                    "sort_order": args[6],
                    "due_date": args[7],
                    "activated_at": args[8],
                    "completed_at": None,
                    "completed_by": None,
                }
            )
            return "INSERT 0 1"

        raise AssertionError(f"Unexpected execute SQL: {sql}")

    async def fetch(self, sql: str, *args):
        if "SELECT * FROM stages WHERE project_id = $1 ORDER BY sort_order" in sql:
            return list(self.stages)

        if "SELECT DISTINCT email" in sql:
            return list(self.recipients)

        raise AssertionError(f"Unexpected fetch SQL: {sql}")


class StageWorkflowConnection:
    def __init__(
        self,
        current_stage: dict,
        next_stage: dict | None = None,
        pending_request: dict | None = None,
        project_row: dict | None = None,
        recipient_rows: list[dict] | None = None,
    ) -> None:
        self.current_stage = current_stage
        self.next_stage = next_stage
        self.pending_request = pending_request
        self.project_row = project_row or {
            "project_code": "P0044",
            "name": "Workflow Test Project",
        }
        self.recipient_rows = recipient_rows or []
        self.execute_calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args):
        if "SELECT * FROM stages WHERE id = $1" in sql:
            return self.current_stage

        if "FROM stage_due_date_change_requests" in sql:
            return self.pending_request

        if "WHERE project_id = $1" in sql and "sort_order > $2" in sql:
            return self.next_stage

        if "SELECT project_code, name" in sql and "FROM projects" in sql:
            return self.project_row

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def fetch(self, sql: str, *args):
        if "SELECT DISTINCT email" in sql and "FROM profiles" in sql:
            return list(self.recipient_rows)

        raise AssertionError(f"Unexpected fetch SQL: {sql}")

    async def execute(self, sql: str, *args):
        self.execute_calls.append((sql, args))
        return "UPDATE 1"


class CommentPool:
    def __init__(
        self,
        stage: dict,
        inserted_comment: dict | None = None,
        mentionable_rows: list[dict] | None = None,
        mention_rows: list[dict] | None = None,
        project_row: dict | None = None,
    ) -> None:
        self.stage = stage
        self.inserted_comment = inserted_comment
        self.calls: list[tuple[str, tuple]] = []
        self.fetch_calls: list[tuple[str, tuple]] = []
        self.mentionable_rows = mentionable_rows or []
        self.mention_rows = mention_rows or []
        self.project_row = project_row

    async def fetchrow(self, sql: str, *args):
        self.calls.append((sql, args))
        if "SELECT * FROM stages WHERE id = $1" in sql:
            return self.stage

        if "WITH inserted AS" in sql:
            return self.inserted_comment

        if "FROM stages s" in sql and "JOIN projects p ON p.id = s.project_id" in sql:
            return self.project_row

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def fetch(self, sql: str, *args):
        self.fetch_calls.append((sql, args))
        if "ORDER BY display_name, email" in sql:
            return list(self.mentionable_rows)

        if "ORDER BY email" in sql:
            return list(self.mention_rows)

        raise AssertionError(f"Unexpected fetch SQL: {sql}")


class WorkflowSettingsConnection:
    def __init__(self) -> None:
        self.executemany_calls: list[tuple[str, list[tuple]]] = []
        self.execute_calls: list[tuple[str, tuple]] = []

    async def executemany(self, sql: str, args: list[tuple]):
        self.executemany_calls.append((sql, args))
        return None

    async def execute(self, sql: str, *args):
        self.execute_calls.append((sql, args))
        return "UPDATE 1"


class MonthlyReportConnection:
    def __init__(self) -> None:
        self.project_rows = [
            {
                "project_id": uuid4(),
                "project_code": "P1002",
                "project_name": "South Rollout",
                "client": "Burger Co",
                "brand": None,
                "priority": ProjectPriority.ACCELERATED.value,
                "assigned_person_name": "Ananya",
                "total_order_value": 50000,
                "number_of_stores": 5,
                "created_at": datetime(2026, 5, 28, 11, 0, tzinfo=timezone.utc),
                "total_stages": 4,
                "completed_stages": 1,
                "active_stages": 0,
                "overdue_stages": 1,
                "pending_stages": 2,
                "completed_this_month": 1,
                "current_stage_name": "Sample Completed by R&D",
                "current_stage_department": Department.RD.value,
                "current_stage_status": StageStatus.OVERDUE.value,
                "current_stage_due_date": date.today() - timedelta(days=3),
            },
            {
                "project_id": uuid4(),
                "project_code": "P1001",
                "project_name": "North Rollout",
                "client": "Acme",
                "brand": "Kian",
                "priority": ProjectPriority.NORMAL.value,
                "assigned_person_name": "Nirvaan",
                "total_order_value": 100000,
                "number_of_stores": 10,
                "created_at": datetime(2026, 6, 5, 10, 0, tzinfo=timezone.utc),
                "total_stages": 5,
                "completed_stages": 2,
                "active_stages": 1,
                "overdue_stages": 0,
                "pending_stages": 2,
                "completed_this_month": 1,
                "current_stage_name": "Costing Shared by R&D",
                "current_stage_department": Department.RD.value,
                "current_stage_status": StageStatus.ACTIVE.value,
                "current_stage_due_date": date(2026, 6, 12),
            },
            {
                "project_id": uuid4(),
                "project_code": "P1003",
                "project_name": "Completed Project",
                "client": "Mega Retail",
                "brand": "Studio",
                "priority": ProjectPriority.NORMAL.value,
                "assigned_person_name": "Ishita",
                "total_order_value": 75000,
                "number_of_stores": 7,
                "created_at": datetime(2026, 6, 3, 9, 0, tzinfo=timezone.utc),
                "total_stages": 3,
                "completed_stages": 3,
                "active_stages": 0,
                "overdue_stages": 0,
                "pending_stages": 0,
                "completed_this_month": 2,
                "current_stage_name": None,
                "current_stage_department": None,
                "current_stage_status": None,
                "current_stage_due_date": None,
            },
        ]
        self.department_rows = [
            {
                "department": Department.SALES.value,
                "total_stages": 5,
                "completed_total": 3,
                "completed_this_month": 2,
                "active_now": 1,
                "overdue_now": 0,
                "pending_now": 1,
                "avg_completion_days": 2.5,
                "avg_delay_days": None,
            },
            {
                "department": Department.RD.value,
                "total_stages": 7,
                "completed_total": 3,
                "completed_this_month": 2,
                "active_now": 1,
                "overdue_now": 1,
                "pending_now": 2,
                "avg_completion_days": 4.0,
                "avg_delay_days": 3.0,
            },
        ]
        self.trend_rows = [
            {"event_type": "project_created", "occurred_on": date(2026, 6, 3)},
            {"event_type": "project_created", "occurred_on": date(2026, 6, 5)},
            {"event_type": "stage_completed", "occurred_on": date(2026, 6, 6)},
            {"event_type": "overdue_event", "occurred_on": date(2026, 6, 13)},
            {"event_type": "comment_logged", "occurred_on": date(2026, 6, 13)},
            {"event_type": "comment_logged", "occurred_on": date(2026, 6, 14)},
        ]
        self.audit_rows = [
            {
                "event_id": uuid4(),
                "changed_at": datetime(2026, 6, 14, 12, 30, tzinfo=timezone.utc),
                "project_id": self.project_rows[1]["project_id"],
                "project_code": "P1002",
                "project_name": "South Rollout",
                "stage_name": "Sample Completed by R&D",
                "event_type": "Stage due date updated",
                "actor_name": "Sales Lead",
                "actor_email": "sales@example.com",
                "old_status": "active",
                "new_status": "active",
                "old_due_date": "2026-06-10",
                "new_due_date": "2026-06-14",
                "comment_text": None,
            },
            {
                "event_id": uuid4(),
                "changed_at": datetime(2026, 6, 14, 13, 0, tzinfo=timezone.utc),
                "project_id": self.project_rows[0]["project_id"],
                "project_code": "P1001",
                "project_name": "North Rollout",
                "stage_name": "Costing Shared by R&D",
                "event_type": "Comment added",
                "actor_name": "R&D Lead",
                "actor_email": "rd@example.com",
                "old_status": None,
                "new_status": None,
                "old_due_date": None,
                "new_due_date": None,
                "comment_text": "Need final client confirmation on the costing revision before we lock samples.",
            },
        ]

    async def fetch(self, sql: str, *args):
        if "stage_counts AS" in sql and "current_stage AS" in sql:
            return list(self.project_rows)

        if "GROUP BY s.responsible_dept" in sql:
            return list(self.department_rows)

        if "SELECT 'project_created' AS event_type" in sql:
            return list(self.trend_rows)

        if "recent_events" in sql and "Comment added" in sql:
            return list(self.audit_rows)

        raise AssertionError(f"Unexpected fetch SQL: {sql}")


class ProjectDocumentPool:
    def __init__(self, project_id) -> None:
        self.project_id = project_id
        self.document_id = uuid4()

    async def fetchrow(self, sql: str, *args):
        if "SELECT id FROM projects" in sql:
            return {"id": self.project_id}

        if "INSERT INTO project_documents" in sql:
            return {
                "id": self.document_id,
                "project_id": args[0],
                "document_type": args[1],
                "file_name": args[2],
                "storage_bucket": args[3],
                "storage_path": args[4],
                "content_type": args[5],
                "file_size": args[6],
                "uploaded_by": args[7],
                "uploaded_by_name": "Sales Lead",
                "created_at": datetime.now(timezone.utc),
            }

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")


class DeleteProjectConnection:
    def __init__(self, project_id) -> None:
        self.project_id = project_id
        self.project_row = {
            "id": project_id,
            "project_code": "P0042",
            "name": "Delete Me",
        }
        self.document_rows = [
            {
                "storage_bucket": "project-documents",
                "storage_path": f"{project_id}/boq/demo.pdf",
            },
            {
                "storage_bucket": "project-documents",
                "storage_path": f"{project_id}/attachment/spec-sheet.xlsx",
            },
        ]
        self.execute_calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args):
        if "FROM projects" in sql and "project_code" in sql:
            return self.project_row

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def fetch(self, sql: str, *args):
        if "FROM project_documents" in sql:
            return list(self.document_rows)

        raise AssertionError(f"Unexpected fetch SQL: {sql}")

    async def execute(self, sql: str, *args):
        self.execute_calls.append((sql, args))
        return "DELETE 1"


class ProjectUpdateConnection:
    def __init__(self, project_id) -> None:
        self.project_id = project_id
        self.fetchrow_calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args):
        self.fetchrow_calls.append((sql, args))
        if "UPDATE projects" in sql:
            return {"id": self.project_id}

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")


class ProjectDetailConnection:
    def __init__(self, project_id) -> None:
        self.project_id = project_id
        self.sales_stage_id = uuid4()
        self.rd_stage_id = uuid4()
        self.project_row = {
            "id": project_id,
            "project_code": "P0099",
            "name": "Department Visibility Test",
            "client": "Acme",
            "brand": "Kian",
            "assigned_person_name": "Nirvaan",
            "priority": ProjectPriority.NORMAL.value,
            "estimated_tat_days": 12,
            "total_order_value": 50000,
            "number_of_stores": 5,
            "special_request": None,
            "created_by": uuid4(),
            "created_by_name": "Sales Lead",
            "created_by_department": Department.SALES.value,
            "created_at": datetime.now(timezone.utc),
            "is_archived": False,
        }
        self.stage_rows = [
            {
                "id": self.sales_stage_id,
                "project_id": project_id,
                "stage_key": "costing_sop_logged",
                "phase": StagePhase.COSTING.value,
                "name": "Costing SOP Logged In",
                "responsible_dept": Department.SALES.value,
                "status": StageStatus.DONE.value,
                "sort_order": 10,
                "activated_at": datetime.now(timezone.utc),
                "due_date": date.today(),
                "completed_at": datetime.now(timezone.utc),
                "completed_by": uuid4(),
            },
            {
                "id": self.rd_stage_id,
                "project_id": project_id,
                "stage_key": "costing_shared_rd",
                "phase": StagePhase.COSTING.value,
                "name": "Costing Shared by R&D",
                "responsible_dept": Department.RD.value,
                "status": StageStatus.ACTIVE.value,
                "sort_order": 20,
                "activated_at": datetime.now(timezone.utc),
                "due_date": date.today() + timedelta(days=2),
                "completed_at": None,
                "completed_by": None,
            },
        ]
        self.comment_rows = [
            {
                "id": uuid4(),
                "stage_id": self.sales_stage_id,
                "user_id": uuid4(),
                "department": Department.SALES.value,
                "author_name": "Sales Lead",
                "text": "Sales-only note",
                "created_at": datetime.now(timezone.utc),
            },
            {
                "id": uuid4(),
                "stage_id": self.rd_stage_id,
                "user_id": uuid4(),
                "department": Department.RD.value,
                "author_name": "R&D Lead",
                "text": "RD-only note",
                "created_at": datetime.now(timezone.utc),
            },
        ]

    async def fetchrow(self, sql: str, *args):
        if "FROM projects pr" in sql:
            return self.project_row

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def fetch(self, sql: str, *args):
        if "SELECT * FROM stages WHERE project_id = $1 ORDER BY sort_order" in sql:
            return list(self.stage_rows)

        if "WHERE c.stage_id = ANY($1::uuid[])" in sql:
            visible_ids = set(args[0])
            return [row for row in self.comment_rows if row["stage_id"] in visible_ids]

        if "FROM stage_due_date_change_requests" in sql:
            return []

        if "FROM project_documents" in sql:
            return []

        raise AssertionError(f"Unexpected fetch SQL: {sql}")


class DueDateRequestConnection:
    def __init__(self, stage: dict, pending_request: dict | None = None) -> None:
        self.stage = stage
        self.pending_request = pending_request
        self.execute_calls: list[tuple[str, tuple]] = []
        self.sales_admin_recipients = [{"email": "admin@example.com"}, {"email": "sales@example.com"}]
        self.all_recipients = [{"email": "qc@example.com"}, {"email": "rd@example.com"}, {"email": "sales@example.com"}]

    async def fetchrow(self, sql: str, *args):
        if "JOIN projects p ON p.id = s.project_id" in sql and "WHERE s.id = $1" in sql:
            return self.stage

        if "FROM stage_due_date_change_requests" in sql and "status = 'pending'" in sql:
            return self.pending_request

        if "SELECT COALESCE(NULLIF(full_name, ''), email) AS display_name" in sql:
            return {"display_name": "Stage Owner"}

        if "JOIN stages s ON s.id = r.stage_id" in sql and "WHERE r.id = $1" in sql:
            return self.pending_request

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def fetch(self, sql: str, *args):
        if "FROM profiles" in sql and "department = ANY" in sql:
            return list(self.sales_admin_recipients)

        if "FROM profiles" in sql and "id = ANY" in sql:
            return [{"email": "rd@example.com"}]

        if "FROM profiles" in sql and "ORDER BY email" in sql:
            return list(self.all_recipients)

        raise AssertionError(f"Unexpected fetch SQL: {sql}")

    async def execute(self, sql: str, *args):
        self.execute_calls.append((sql, args))
        return "OK"


class ReminderSchedulerConnection:
    def __init__(self) -> None:
        self.stage_rows = [
            {
                "id": uuid4(),
                "stage_name": "Costing Shared by R&D",
                "due_date": date.today() + timedelta(days=7),
                "responsible_dept": Department.RD.value,
                "project_id": uuid4(),
                "project_code": "P0055",
                "project_name": "Reminder Pilot",
                "days_until_due": 7,
            },
            {
                "id": uuid4(),
                "stage_name": "Production Started",
                "due_date": date.today() + timedelta(days=1),
                "responsible_dept": Department.PRODUCTION.value,
                "project_id": uuid4(),
                "project_code": "P0056",
                "project_name": "Final Warning Project",
                "days_until_due": 1,
            },
        ]
        self.recipient_rows = {
            Department.RD.value: [
                {"email": "admin@example.com"},
                {"email": "rd@example.com"},
                {"email": "sales@example.com"},
            ],
            Department.PRODUCTION.value: [
                {"email": "admin@example.com"},
                {"email": "prod@example.com"},
                {"email": "sales@example.com"},
            ],
        }
        self.execute_calls: list[tuple[str, tuple]] = []

    async def fetch(self, sql: str, *args):
        if "FROM stages s" in sql and "stage_deadline_reminder_log" in sql:
            return list(self.stage_rows)

        if "FROM profiles" in sql and "department = ANY" in sql:
            departments = set(args[0])
            if Department.RD.value in departments:
                return list(self.recipient_rows[Department.RD.value])
            if Department.PRODUCTION.value in departments:
                return list(self.recipient_rows[Department.PRODUCTION.value])

        raise AssertionError(f"Unexpected fetch SQL: {sql}")

    async def execute(self, sql: str, *args):
        self.execute_calls.append((sql, args))
        return "INSERT 0 1"


def stage_row(**overrides) -> dict:
    data = {
        "id": uuid4(),
        "project_id": uuid4(),
        "stage_key": "sample-stage",
        "phase": "costing",
        "name": "Sample Stage",
        "responsible_dept": Department.SALES.value,
        "status": StageStatus.ACTIVE.value,
        "sort_order": 10,
        "activated_at": datetime.now(timezone.utc),
        "due_date": None,
        "completed_at": None,
        "completed_by": None,
    }
    data.update(overrides)
    return data


def setting_row(stage_key: str, sort_order: int, dept: Department, due_days: int | None) -> dict:
    return {
        "stage_key": stage_key,
        "phase": StagePhase.COSTING.value,
        "name": stage_key.replace("_", " ").title(),
        "responsible_dept": dept.value,
        "sort_order": sort_order,
        "default_due_days": due_days,
        "updated_at": datetime.now(timezone.utc),
    }


def test_create_project_seeds_first_stage_active_and_dates_it(monkeypatch) -> None:
    connection = CreateProjectConnection()
    patch_transaction(monkeypatch, projects, connection)
    patch_audit_actor(monkeypatch, projects)
    sent_summaries: list[dict] = []

    class FakeNotificationService:
        def __init__(self, _settings) -> None:
            pass

        async def send_project_created_summary(self, **kwargs) -> None:
            sent_summaries.append(kwargs)

    blueprint = [
        StageTemplate(
            stage_key="costing_sop_logged",
            phase=StagePhase.COSTING,
            name="Costing SOP Logged In",
            responsible_dept=Department.SALES,
            sort_order=10,
            default_due_days=1,
        ),
        StageTemplate(
            stage_key="costing_shared_rd",
            phase=StagePhase.COSTING,
            name="Costing Shared by R&D",
            responsible_dept=Department.RD,
            sort_order=20,
            default_due_days=3,
        ),
    ]

    async def fake_load_stage_blueprint(_connection):
        return blueprint

    monkeypatch.setattr(projects, "load_stage_blueprint", fake_load_stage_blueprint)
    monkeypatch.setattr(projects, "NotificationService", FakeNotificationService)

    result = run_async(
        projects.create_project(
            ProjectCreate(
                name="Chair Program",
                client="Acme",
                brand="Kian",
                assigned_person_name="Nirvaan Sawhney",
                priority=ProjectPriority.ACCELERATED,
                estimated_tat_days=21,
                total_order_value=125000,
                number_of_stores=48,
                special_request="Complete sampling before festive launch.",
            ),
            pool=object(),
            settings=Settings(frontend_url="http://localhost:3000"),
            user=make_user(Department.SALES),
        )
    )

    assert len(result.stages) == 2
    assert result.project_code == "P0001"
    assert result.assigned_person_name == "Nirvaan Sawhney"
    assert result.priority == ProjectPriority.ACCELERATED
    assert result.estimated_tat_days == 21
    assert result.total_order_value == 125000
    assert result.number_of_stores == 48
    assert result.created_by_name == "Sales Lead"
    assert result.stages[0].stage_key == "costing_sop_logged"
    assert result.stages[0].status == StageStatus.ACTIVE
    assert result.stages[0].due_date == date.today() + timedelta(days=1)
    assert result.stages[0].activated_at is not None
    assert result.stages[1].stage_key == "costing_shared_rd"
    assert result.stages[1].status == StageStatus.PENDING
    assert result.stages[1].due_date is None
    assert result.stages[1].activated_at is None
    assert sent_summaries == [
        {
            "project_code": "P0001",
            "project_name": "Chair Program",
            "client": "Acme",
            "brand": "Kian",
            "assigned_person_name": "Nirvaan Sawhney",
            "priority": "accelerated",
            "created_by_name": "Sales Lead",
            "created_by_department": Department.SALES.value,
            "estimated_tat_days": 21,
            "total_order_value": 125000,
            "number_of_stores": 48,
            "special_request": "Complete sampling before festive launch.",
            "current_stage_name": "Costing SOP Logged In",
            "recipients": ["sales@example.com", "rd@example.com"],
            "project_url": f"http://localhost:3000/projects/{connection.project_id}",
        }
    ]


def test_complete_stage_marks_done_and_activates_next_stage(monkeypatch) -> None:
    current = stage_row(
        responsible_dept=Department.RD.value,
        status=StageStatus.ACTIVE.value,
        stage_key="costing_shared_rd",
    )
    next_stage = stage_row(
        stage_key="costing_revision_items",
        responsible_dept=Department.RD.value,
        status=StageStatus.PENDING.value,
        sort_order=20,
        due_date=None,
        activated_at=None,
    )
    next_stage["project_id"] = current["project_id"]
    connection = StageWorkflowConnection(current_stage=current, next_stage=next_stage)

    patch_transaction(monkeypatch, stages, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, stages, audit_calls)

    async def fake_due_days(_connection):
        return {"costing_revision_items": 5}

    async def fake_load_project_detail(_connection, project_id, *args, **kwargs):
        return {"project_id": str(project_id), "refreshed": True}

    monkeypatch.setattr(stages, "get_due_days_by_stage_key", fake_due_days)
    monkeypatch.setattr(stages, "load_project_detail", fake_load_project_detail)

    user = make_user(Department.RD)
    result = run_async(
        stages.complete_stage(
            current["id"],
            pool=object(),
            settings=Settings(frontend_url="http://localhost:3000"),
            user=user,
        )
    )

    assert result == {"project_id": str(current["project_id"]), "refreshed": True}
    assert len(connection.execute_calls) == 2
    assert "SET status = 'done'" in connection.execute_calls[0][0]
    assert connection.execute_calls[0][1] == (current["id"], user.user_id)
    assert "SET status = 'active'" in connection.execute_calls[1][0]
    assert connection.execute_calls[1][1] == (next_stage["id"], 5)
    assert audit_calls == [user.user_id]


def test_complete_stage_sends_handoff_email_to_next_team(monkeypatch) -> None:
    current = stage_row(
        name="Costing SOP Logged In",
        responsible_dept=Department.SALES.value,
        status=StageStatus.ACTIVE.value,
        due_date=date.today() + timedelta(days=2),
    )
    next_stage = stage_row(
        stage_key="costing_bom_prepared",
        name="BOM Prepared by R&D",
        responsible_dept=Department.RD.value,
        status=StageStatus.PENDING.value,
        sort_order=20,
        due_date=None,
        activated_at=None,
    )
    next_stage["project_id"] = current["project_id"]
    connection = StageWorkflowConnection(
        current_stage=current,
        next_stage=next_stage,
        project_row={"project_code": "P0101", "name": "Handoff Email Test"},
        recipient_rows=[{"email": "rd@example.com"}],
    )

    patch_transaction(monkeypatch, stages, connection)
    patch_audit_actor(monkeypatch, stages)
    sent_notifications: list[dict] = []

    class FakeNotificationService:
        def __init__(self, _settings) -> None:
            pass

        async def send_stage_handoff_notification(self, **kwargs) -> None:
            sent_notifications.append(kwargs)

    async def fake_due_days(_connection):
        return {"costing_bom_prepared": 4}

    async def fake_load_project_detail(_connection, project_id, *args, **kwargs):
        return {"project_id": str(project_id), "handoff": True}

    monkeypatch.setattr(stages, "get_due_days_by_stage_key", fake_due_days)
    monkeypatch.setattr(stages, "load_project_detail", fake_load_project_detail)
    monkeypatch.setattr(stages, "NotificationService", FakeNotificationService)

    result = run_async(
        stages.complete_stage(
            current["id"],
            pool=object(),
            settings=Settings(frontend_url="http://localhost:3000"),
            user=make_user(Department.SALES),
        )
    )

    assert result == {"project_id": str(current["project_id"]), "handoff": True}
    assert sent_notifications == [
        {
            "project_code": "P0101",
            "project_name": "Handoff Email Test",
            "completed_stage_name": "Costing SOP Logged In",
            "completed_stage_department": Department.SALES.value,
            "next_stage_name": "BOM Prepared by R&D",
            "next_stage_department": Department.RD.value,
            "due_date": date.today() + timedelta(days=4),
            "handoff_status": "completed_before_time",
            "recipients": ["rd@example.com"],
            "project_url": f"http://localhost:3000/projects/{current['project_id']}",
        }
    ]


def test_complete_stage_rejects_wrong_department(monkeypatch) -> None:
    current = stage_row(
        responsible_dept=Department.RD.value,
        status=StageStatus.ACTIVE.value,
    )
    connection = StageWorkflowConnection(current_stage=current)
    patch_transaction(monkeypatch, stages, connection)
    patch_audit_actor(monkeypatch, stages)

    with pytest.raises(HTTPException) as exc:
        run_async(
            stages.complete_stage(
                current["id"],
                pool=object(),
                settings=Settings(frontend_url="http://localhost:3000"),
                user=make_user(Department.SALES),
            )
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Not your stage to complete."
    assert connection.execute_calls == []


def test_non_admin_cannot_change_a_locked_due_date(monkeypatch) -> None:
    current = stage_row(
        due_date=date.today(),
        responsible_dept=Department.RD.value,
    )
    connection = StageWorkflowConnection(current_stage=current)
    patch_transaction(monkeypatch, stages, connection)
    patch_audit_actor(monkeypatch, stages)

    with pytest.raises(HTTPException) as exc:
        run_async(
            stages.set_stage_due_date(
                current["id"],
                StageDueDateUpdate(due_date=date.today() + timedelta(days=2)),
                pool=object(),
                user=make_user(Department.RD),
            )
        )

    assert exc.value.status_code == 403
    assert "Only Sales or Admin can set or update due dates directly." == exc.value.detail
    assert connection.execute_calls == []


def test_admin_can_override_a_due_date(monkeypatch) -> None:
    current = stage_row(due_date=date.today())
    connection = StageWorkflowConnection(current_stage=current)
    patch_transaction(monkeypatch, stages, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, stages, audit_calls)

    async def fake_load_project_detail(_connection, project_id, *args, **kwargs):
        return {"project_id": str(project_id), "updated": True}

    monkeypatch.setattr(stages, "load_project_detail", fake_load_project_detail)

    new_due_date = date.today() + timedelta(days=3)
    result = run_async(
        stages.set_stage_due_date(
            current["id"],
            StageDueDateUpdate(due_date=new_due_date),
            pool=object(),
            user=make_user(Department.ADMIN),
        )
    )

    assert result == {"project_id": str(current["project_id"]), "updated": True}
    assert len(connection.execute_calls) == 1
    assert "UPDATE stages" in connection.execute_calls[0][0]
    assert connection.execute_calls[0][1] == (current["id"], new_due_date)
    assert audit_calls and audit_calls[0] is not None


def test_department_user_can_request_due_date_change(monkeypatch) -> None:
    current = stage_row(
        responsible_dept=Department.RD.value,
        status=StageStatus.ACTIVE.value,
        name="Costing Shared by R&D",
        due_date=date.today() + timedelta(days=2),
    )
    current["project_code"] = "P0047"
    current["project_name"] = "Acme Rollout"
    connection = DueDateRequestConnection(stage=current)
    user = make_user(Department.RD)
    patch_transaction(monkeypatch, stages, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, stages, audit_calls)
    sent_notifications: list[dict] = []

    class FakeNotificationService:
        def __init__(self, _settings) -> None:
            pass

        async def send_due_date_change_request(self, **kwargs) -> None:
            sent_notifications.append(kwargs)

    async def fake_load_project_detail(_connection, project_id, *args, **kwargs):
        return {"project_id": str(project_id), "request_saved": True}

    monkeypatch.setattr(stages, "NotificationService", FakeNotificationService)
    monkeypatch.setattr(stages, "load_project_detail", fake_load_project_detail)

    requested_due_date = date.today() + timedelta(days=5)
    result = run_async(
        stages.request_stage_due_date_change(
            current["id"],
            StageDueDateChangeRequestCreate(
                requested_due_date=requested_due_date,
                reason="Vendor dispatch shifted and we need more buffer.",
            ),
            pool=object(),
            settings=Settings(frontend_url="http://localhost:3000"),
            user=user,
        )
    )

    assert result == {"project_id": str(current["project_id"]), "request_saved": True}
    assert audit_calls == [user.user_id]
    assert len(connection.execute_calls) == 1
    assert "INSERT INTO stage_due_date_change_requests" in connection.execute_calls[0][0]
    assert connection.execute_calls[0][1] == (
        current["id"],
        user.user_id,
        Department.RD.value,
        current["due_date"],
        requested_due_date,
        "Vendor dispatch shifted and we need more buffer.",
    )
    assert sent_notifications == [
        {
            "project_code": "P0047",
            "project_name": "Acme Rollout",
            "stage_name": "Costing Shared by R&D",
            "current_due_date": current["due_date"],
            "requested_due_date": requested_due_date,
            "requested_by_name": "Stage Owner",
            "requested_by_department": Department.RD.value,
            "reason": "Vendor dispatch shifted and we need more buffer.",
            "recipients": ["admin@example.com", "sales@example.com"],
            "project_url": f"http://localhost:3000/projects/{current['project_id']}",
        }
    ]


def test_sales_can_approve_due_date_request(monkeypatch) -> None:
    current = stage_row(
        responsible_dept=Department.RD.value,
        status=StageStatus.ACTIVE.value,
        name="Costing Shared by R&D",
        due_date=date.today() + timedelta(days=2),
    )
    request_id = uuid4()
    pending_request = {
        "id": request_id,
        "stage_id": current["id"],
        "requested_by": uuid4(),
        "requested_by_department": Department.RD.value,
        "current_due_date": current["due_date"],
        "requested_due_date": date.today() + timedelta(days=6),
        "reason": "Material availability has shifted by four days.",
        "status": "pending",
        "project_id": current["project_id"],
        "project_code": "P0048",
        "project_name": "North Zone Rollout",
        "stage_name": current["name"],
        "requestor_name": "R&D Lead",
    }
    connection = DueDateRequestConnection(stage=current, pending_request=pending_request)
    user = make_user(Department.SALES)
    patch_transaction(monkeypatch, stages, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, stages, audit_calls)
    sent_notifications: list[dict] = []

    class FakeNotificationService:
        def __init__(self, _settings) -> None:
            pass

        async def send_due_date_change_resolution(self, **kwargs) -> None:
            sent_notifications.append(kwargs)

    async def fake_load_project_detail(_connection, project_id, *args, **kwargs):
        return {"project_id": str(project_id), "reviewed": True}

    monkeypatch.setattr(stages, "NotificationService", FakeNotificationService)
    monkeypatch.setattr(stages, "load_project_detail", fake_load_project_detail)

    result = run_async(
        stages.review_stage_due_date_request(
            current["id"],
            request_id,
            StageDueDateChangeRequestReview(
                action="approve",
                note="Approved after checking the updated procurement commitment.",
            ),
            pool=object(),
            settings=Settings(frontend_url="http://localhost:3000"),
            user=user,
        )
    )

    assert result == {"project_id": str(current["project_id"]), "reviewed": True}
    assert audit_calls == [user.user_id]
    assert len(connection.execute_calls) == 2
    assert "UPDATE stages" in connection.execute_calls[0][0]
    assert connection.execute_calls[0][1] == (current["id"], pending_request["requested_due_date"])
    assert "UPDATE stage_due_date_change_requests" in connection.execute_calls[1][0]
    assert connection.execute_calls[1][1] == (
        request_id,
        "approved",
        user.user_id,
        "Approved after checking the updated procurement commitment.",
    )
    assert sent_notifications == [
        {
            "project_code": "P0048",
            "project_name": "North Zone Rollout",
            "stage_name": "Costing Shared by R&D",
            "status": "approved",
            "previous_due_date": current["due_date"],
            "requested_due_date": pending_request["requested_due_date"],
            "requested_by_name": "R&D Lead",
            "reviewed_by_name": "Stage Owner",
            "reason": "Material availability has shifted by four days.",
            "review_note": "Approved after checking the updated procurement commitment.",
            "recipients": ["qc@example.com", "rd@example.com", "sales@example.com"],
            "project_url": f"http://localhost:3000/projects/{current['project_id']}",
        }
    ]


def test_stage_deadline_reminders_send_and_log_once_per_window(monkeypatch) -> None:
    connection = ReminderSchedulerConnection()
    patch_transaction(monkeypatch, scheduler_service, connection)
    sent_notifications: list[dict] = []

    class FakeNotificationService:
        def __init__(self, _settings) -> None:
            pass

        async def send_stage_deadline_reminder(self, **kwargs) -> None:
            sent_notifications.append(kwargs)

    monkeypatch.setattr(scheduler_service, "NotificationService", FakeNotificationService)
    monkeypatch.setattr(
        scheduler_service,
        "get_settings",
        lambda: Settings(frontend_url="http://localhost:3000", stage_reminder_offsets_raw="7,3,1"),
    )

    app = SimpleNamespace(state=SimpleNamespace(db_pool=object()))
    run_async(scheduler_service.send_stage_deadline_reminders(app))

    assert sent_notifications == [
        {
            "project_code": "P0055",
            "project_name": "Reminder Pilot",
            "stage_name": "Costing Shared by R&D",
            "due_date": connection.stage_rows[0]["due_date"],
            "days_until_due": 7,
            "responsible_department": Department.RD.value,
            "recipients": ["admin@example.com", "rd@example.com", "sales@example.com"],
            "project_url": f"http://localhost:3000/projects/{connection.stage_rows[0]['project_id']}",
        },
        {
            "project_code": "P0056",
            "project_name": "Final Warning Project",
            "stage_name": "Production Started",
            "due_date": connection.stage_rows[1]["due_date"],
            "days_until_due": 1,
            "responsible_department": Department.PRODUCTION.value,
            "recipients": ["admin@example.com", "prod@example.com", "sales@example.com"],
            "project_url": f"http://localhost:3000/projects/{connection.stage_rows[1]['project_id']}",
        },
    ]
    assert len(connection.execute_calls) == 2
    assert "INSERT INTO stage_deadline_reminder_log" in connection.execute_calls[0][0]
    assert connection.execute_calls[0][1] == (
        connection.stage_rows[0]["id"],
        7,
        date.today(),
        ["admin@example.com", "rd@example.com", "sales@example.com"],
    )
    assert connection.execute_calls[1][1] == (
        connection.stage_rows[1]["id"],
        1,
        date.today(),
        ["admin@example.com", "prod@example.com", "sales@example.com"],
    )


def test_extract_mentioned_emails_deduplicates_and_preserves_order() -> None:
    mentions = comments._extract_mentioned_emails(
        "Please review @rd@example.com, then sync with @admin@example.com and @rd@example.com."
    )

    assert mentions == ["rd@example.com", "admin@example.com"]


def test_list_stage_mentionable_users_returns_stage_team_sales_and_admin(monkeypatch) -> None:
    user = make_user(Department.PROCUREMENT)
    stage = stage_row(responsible_dept=Department.PROCUREMENT.value)
    pool = CommentPool(
        stage=stage,
        mentionable_rows=[
            {
                "id": uuid4(),
                "display_name": "Admin User",
                "email": "admin@example.com",
                "department": Department.ADMIN.value,
            },
            {
                "id": uuid4(),
                "display_name": "Procurement Lead",
                "email": "procurement@example.com",
                "department": Department.PROCUREMENT.value,
            },
            {
                "id": uuid4(),
                "display_name": "Sales User",
                "email": "sales@example.com",
                "department": Department.SALES.value,
            },
        ],
    )
    patch_transaction(monkeypatch, comments, pool)

    result = run_async(
        comments.list_stage_mentionable_users(
            stage["id"],
            pool=pool,
            user=user,
        )
    )

    assert [profile.email for profile in result] == [
        "admin@example.com",
        "procurement@example.com",
        "sales@example.com",
    ]
    assert len(pool.fetch_calls) == 1
    assert pool.fetch_calls[0][1] == (
        user.user_id,
        [Department.ADMIN.value, Department.PROCUREMENT.value, Department.SALES.value],
    )


def test_list_stage_mentionable_users_rejects_unrelated_department(monkeypatch) -> None:
    stage = stage_row(responsible_dept=Department.PROCUREMENT.value)
    pool = CommentPool(stage=stage)
    patch_transaction(monkeypatch, comments, pool)

    with pytest.raises(HTTPException) as exc:
        run_async(
            comments.list_stage_mentionable_users(
                stage["id"],
                pool=pool,
                user=make_user(Department.QC),
            )
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "You cannot view mentionable users for this stage."
    assert pool.fetch_calls == []


def test_comments_are_rejected_for_non_active_stages(monkeypatch) -> None:
    pool = CommentPool(stage=stage_row(status=StageStatus.DONE.value))
    patch_transaction(monkeypatch, comments, pool)
    patch_audit_actor(monkeypatch, comments)

    with pytest.raises(HTTPException) as exc:
        run_async(
            comments.add_comment(
                pool.stage["id"],
                CommentCreate(text="Need follow-up"),
                pool=pool,
                settings=Settings(),
                user=make_user(Department.SALES),
            )
        )

    assert exc.value.status_code == 409
    assert "Comments are only allowed while a stage is active or overdue." in exc.value.detail
    assert len(pool.calls) == 1


def test_comments_return_author_name_for_active_stages(monkeypatch) -> None:
    user = make_user(Department.SALES)
    active_stage = stage_row(status=StageStatus.ACTIVE.value)
    inserted_comment = {
        "id": uuid4(),
        "stage_id": active_stage["id"],
        "user_id": user.user_id,
        "department": Department.SALES.value,
        "author_name": "Sales Lead",
        "text": "Client approved the costing.",
        "created_at": datetime.now(timezone.utc),
    }
    pool = CommentPool(stage=active_stage, inserted_comment=inserted_comment)
    patch_transaction(monkeypatch, comments, pool)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, comments, audit_calls)

    result = run_async(
        comments.add_comment(
            active_stage["id"],
            CommentCreate(text="Client approved the costing."),
            pool=pool,
            settings=Settings(),
            user=user,
        )
    )

    assert result.author_name == "Sales Lead"
    assert result.department == Department.SALES
    assert result.text == "Client approved the costing."
    assert len(pool.calls) == 2
    assert audit_calls == [user.user_id]


def test_comment_mentions_trigger_notification_for_allowed_matches(monkeypatch) -> None:
    user = make_user(Department.SALES)
    project_id = uuid4()
    active_stage = stage_row(
        status=StageStatus.ACTIVE.value,
        responsible_dept=Department.RD.value,
        name="Costing Shared by R&D",
        project_id=project_id,
    )
    inserted_comment = {
        "id": uuid4(),
        "stage_id": active_stage["id"],
        "user_id": user.user_id,
        "department": Department.SALES.value,
        "author_name": "Sales Lead",
        "text": "Please review @rd@example.com and sync with @qc@example.com.",
        "created_at": datetime.now(timezone.utc),
    }
    pool = CommentPool(
        stage=active_stage,
        inserted_comment=inserted_comment,
        mention_rows=[
            {
                "id": uuid4(),
                "email": "rd@example.com",
                "display_name": "R&D Lead",
            }
        ],
        project_row={
            "project_id": project_id,
            "project_code": "P0200",
            "project_name": "Mention Pilot",
            "stage_name": active_stage["name"],
        },
    )
    patch_transaction(monkeypatch, comments, pool)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, comments, audit_calls)
    sent_notifications: list[dict] = []

    class FakeNotificationService:
        def __init__(self, _settings) -> None:
            pass

        async def send_comment_mention(self, **kwargs) -> None:
            sent_notifications.append(kwargs)

    monkeypatch.setattr(comments, "NotificationService", FakeNotificationService)

    result = run_async(
        comments.add_comment(
            active_stage["id"],
            CommentCreate(text="Please review @rd@example.com and sync with @qc@example.com."),
            pool=pool,
            settings=Settings(frontend_url="http://localhost:3000"),
            user=user,
        )
    )

    assert result.author_name == "Sales Lead"
    assert result.text == "Please review @rd@example.com and sync with @qc@example.com."
    assert audit_calls == [user.user_id]
    assert len(pool.fetch_calls) == 1
    assert pool.fetch_calls[0][1] == (
        ["rd@example.com", "qc@example.com"],
        user.user_id,
        [Department.ADMIN.value, Department.RD.value, Department.SALES.value],
    )
    assert sent_notifications == [
        {
            "project_code": "P0200",
            "project_name": "Mention Pilot",
            "stage_name": "Costing Shared by R&D",
            "author_name": "Sales Lead",
            "author_department": Department.SALES.value,
            "comment_text": "Please review @rd@example.com and sync with @qc@example.com.",
            "recipients": ["rd@example.com"],
            "project_url": f"http://localhost:3000/projects/{project_id}",
        }
    ]


def test_monthly_report_rolls_up_projects_departments_trends_and_audit(monkeypatch) -> None:
    connection = MonthlyReportConnection()
    patch_transaction(monkeypatch, reports, connection)

    report_response = run_async(
        reports.get_monthly_report(
            month="2026-06",
            pool=object(),
            user=make_user(Department.SALES),
        )
    )

    assert report_response.month == "2026-06"
    assert report_response.overview.projects_in_scope == 3
    assert report_response.overview.projects_created == 2
    assert report_response.overview.active_projects == 1
    assert report_response.overview.overdue_projects == 1
    assert report_response.overview.completed_projects == 1
    assert report_response.overview.stages_completed == 4
    assert report_response.overview.overdue_events == 1
    assert report_response.overview.comments_logged == 2
    assert report_response.overview.total_pipeline_value == 225000.0
    assert report_response.overview.stores_in_scope == 22

    assert len(report_response.departments) == 2
    assert report_response.departments[0].department == Department.SALES
    assert report_response.departments[0].completion_rate == 60.0
    assert report_response.departments[1].department == Department.RD
    assert report_response.departments[1].avg_delay_days == 3.0

    assert len(report_response.projects) == 3
    assert report_response.projects[0].status_label == "Overdue"
    assert report_response.projects[0].current_delay_days == 3
    assert report_response.projects[1].status_label == "Active"
    assert report_response.projects[2].status_label == "Completed"

    assert len(report_response.trends) == 5
    assert report_response.trends[0].label == "Week 1"
    assert report_response.trends[0].projects_created == 2
    assert report_response.trends[0].stages_completed == 1
    assert report_response.trends[1].overdue_events == 1
    assert report_response.trends[1].comments_logged == 2

    assert len(report_response.audit_events) == 2
    assert report_response.audit_events[0].details == "Due date: 10 Jun 2026 -> 14 Jun 2026"
    assert "Need final client confirmation" in report_response.audit_events[1].details


def test_monthly_report_rejects_non_sales_non_admin_users(monkeypatch) -> None:
    connection = MonthlyReportConnection()
    patch_transaction(monkeypatch, reports, connection)

    with pytest.raises(HTTPException) as exc:
        run_async(
            reports.get_monthly_report(
                month="2026-06",
                pool=object(),
                user=make_user(Department.QC),
            )
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Only Sales or Admin can access reports."


def test_upload_project_document_persists_metadata_and_returns_signed_url(monkeypatch) -> None:
    pool = ProjectDocumentPool(project_id=uuid4())
    user = make_user(Department.SALES)
    patch_transaction(monkeypatch, projects, pool)

    async def fake_upload_storage_object(*_args, **_kwargs) -> None:
        return None

    async def fake_create_signed_download_url(*_args, **_kwargs) -> str:
        return "https://example.com/signed/document"

    monkeypatch.setattr(projects, "upload_storage_object", fake_upload_storage_object)
    monkeypatch.setattr(projects, "create_signed_download_url", fake_create_signed_download_url)

    upload = UploadFile(filename="boq.xlsx", file=BytesIO(b"demo-file"))

    result = run_async(
        projects.upload_project_document(
            pool.project_id,
            document_type=ProjectDocumentType.BOQ,
            file=upload,
            pool=pool,
            settings=Settings(
                supabase_url="https://example.supabase.co",
                supabase_service_key="service-key",
            ),
            user=user,
        )
    )

    assert result.project_id == pool.project_id
    assert result.document_type == ProjectDocumentType.BOQ
    assert result.file_name == "boq.xlsx"
    assert result.file_size == len(b"demo-file")
    assert result.uploaded_by == user.user_id
    assert result.uploaded_by_name == "Sales Lead"
    assert result.download_url == "https://example.com/signed/document"


def test_build_project_documents_converts_file_size_without_duplicate_kwargs() -> None:
    documents = run_async(
        projects._build_project_documents(
            [
                {
                    "id": uuid4(),
                    "project_id": uuid4(),
                    "document_type": ProjectDocumentType.BOQ.value,
                    "file_name": "boq.pdf",
                    "content_type": "application/pdf",
                    "file_size": 2048,
                    "storage_bucket": "project-documents",
                    "storage_path": "demo/boq/file.pdf",
                    "uploaded_by": uuid4(),
                    "uploaded_by_name": "Sales Lead",
                    "created_at": datetime.now(timezone.utc),
                }
            ]
        )
    )

    assert len(documents) == 1
    assert documents[0].file_name == "boq.pdf"
    assert documents[0].file_size == 2048


def test_default_workflow_includes_costing_bom_stage_after_costing_sop() -> None:
    stage_keys = [template.stage_key for template in DEFAULT_STAGE_BLUEPRINT]

    assert stage_keys[0] == "costing_sop_logged"
    assert stage_keys[1] == "costing_bom_prepared"
    assert stage_keys[2] == "costing_shared_rd"

    bom_stage = DEFAULT_STAGE_BLUEPRINT[1]
    assert bom_stage.name == "BOM Prepared by R&D"
    assert bom_stage.phase == StagePhase.COSTING
    assert bom_stage.responsible_dept == Department.RD
    assert bom_stage.sort_order == 15


def test_department_users_only_receive_their_own_stages_in_project_detail() -> None:
    project_id = uuid4()
    connection = ProjectDetailConnection(project_id)

    detail = run_async(
        projects.load_project_detail(
            connection,
            project_id,
            viewer_department=Department.RD,
        )
    )

    assert len(detail.stages) == 1
    assert detail.stages[0].stage_key == "costing_shared_rd"
    assert detail.stages[0].responsible_dept == Department.RD
    assert len(detail.stages[0].comments) == 1
    assert detail.stages[0].comments[0].text == "RD-only note"


def test_delete_project_cleans_up_audit_rows_and_storage_objects(monkeypatch) -> None:
    project_id = uuid4()
    connection = DeleteProjectConnection(project_id)
    user = make_user(Department.ADMIN)
    patch_transaction(monkeypatch, projects, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, projects, audit_calls)
    deleted_storage_objects: list[tuple[str, str]] = []

    async def fake_delete_storage_object(_settings, *, bucket: str, path: str) -> None:
        deleted_storage_objects.append((bucket, path))

    monkeypatch.setattr(projects, "delete_storage_object", fake_delete_storage_object)

    response = run_async(
        projects.delete_project(
            project_id,
            pool=object(),
            settings=Settings(),
            user=user,
        )
    )

    assert response.status_code == 204
    assert audit_calls == [user.user_id]
    assert len(connection.execute_calls) == 2
    assert "DELETE FROM audit_log" in connection.execute_calls[0][0]
    assert connection.execute_calls[0][1] == (project_id,)
    assert connection.execute_calls[1] == ("DELETE FROM projects WHERE id = $1", (project_id,))
    assert deleted_storage_objects == [
        ("project-documents", f"{project_id}/boq/demo.pdf"),
        ("project-documents", f"{project_id}/attachment/spec-sheet.xlsx"),
    ]


def test_delete_project_rejects_non_admin_users() -> None:
    with pytest.raises(HTTPException) as exc:
        run_async(
            projects.delete_project(
                uuid4(),
                pool=object(),
                settings=Settings(),
                user=make_user(Department.SALES),
            )
        )

    assert exc.value.status_code == 403
    assert exc.value.detail == "Only Admin can delete projects."


def test_update_project_metadata_persists_optional_values(monkeypatch) -> None:
    project_id = uuid4()
    connection = ProjectUpdateConnection(project_id)
    user = make_user(Department.SALES)
    patch_transaction(monkeypatch, projects, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, projects, audit_calls)

    async def fake_load_project_detail(_connection, requested_project_id, *args, **kwargs):
        return {"id": str(requested_project_id), "updated": True}

    monkeypatch.setattr(projects, "load_project_detail", fake_load_project_detail)

    result = run_async(
        projects.update_project_metadata(
            project_id,
            ProjectUpdate(
                assigned_person_name="  Nirvaan  ",
                priority=ProjectPriority.ACCELERATED,
                estimated_tat_days=18,
                total_order_value=225000,
                number_of_stores=32,
                special_request="  Fast-track sample approval.  ",
            ),
            pool=object(),
            settings=Settings(),
            user=user,
        )
    )

    assert result == {"id": str(project_id), "updated": True}
    assert audit_calls == [user.user_id]
    assert len(connection.fetchrow_calls) == 1
    assert "UPDATE projects" in connection.fetchrow_calls[0][0]
    assert connection.fetchrow_calls[0][1] == (
        project_id,
        "Nirvaan",
        ProjectPriority.ACCELERATED.value,
        18,
        225000.0,
        32,
        "Fast-track sample approval.",
    )


def test_workflow_settings_update_requires_every_stage_key(monkeypatch) -> None:
    connection = WorkflowSettingsConnection()
    patch_transaction(monkeypatch, workflow_settings, connection)
    patch_audit_actor(monkeypatch, workflow_settings)

    initial_rows = [
        setting_row("stage_a", 10, Department.SALES, 1),
        setting_row("stage_b", 20, Department.RD, 2),
    ]

    async def fake_fetch_workflow_settings_rows(_connection):
        return initial_rows

    monkeypatch.setattr(workflow_settings, "fetch_workflow_settings_rows", fake_fetch_workflow_settings_rows)

    payload = WorkflowStageSettingUpdateRequest(
        settings=[
            WorkflowStageSettingUpdate(
                stage_key="stage_a",
                responsible_dept=Department.ADMIN,
                default_due_days=4,
            )
        ]
    )

    with pytest.raises(HTTPException) as exc:
        run_async(
            workflow_settings.update_workflow_settings(
                payload,
                pool=object(),
                user=make_user(Department.ADMIN),
            )
        )

    assert exc.value.status_code == 400
    assert "include every configured stage exactly once" in exc.value.detail
    assert connection.executemany_calls == []


def test_workflow_settings_update_rewrites_pending_stage_templates(monkeypatch) -> None:
    connection = WorkflowSettingsConnection()
    patch_transaction(monkeypatch, workflow_settings, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, workflow_settings, audit_calls)

    initial_rows = [
        setting_row("stage_a", 10, Department.SALES, 1),
        setting_row("stage_b", 20, Department.RD, 2),
    ]
    updated_rows = [
        setting_row("stage_a", 10, Department.ADMIN, 4),
        setting_row("stage_b", 20, Department.RD, 2),
    ]
    calls = {"count": 0}

    async def fake_fetch_workflow_settings_rows(_connection):
        calls["count"] += 1
        return initial_rows if calls["count"] == 1 else updated_rows

    monkeypatch.setattr(workflow_settings, "fetch_workflow_settings_rows", fake_fetch_workflow_settings_rows)

    payload = WorkflowStageSettingUpdateRequest(
        settings=[
            WorkflowStageSettingUpdate(
                stage_key="stage_a",
                responsible_dept=Department.ADMIN,
                default_due_days=4,
            ),
            WorkflowStageSettingUpdate(
                stage_key="stage_b",
                responsible_dept=Department.RD,
                default_due_days=2,
            ),
        ]
    )

    result = run_async(
        workflow_settings.update_workflow_settings(
            payload,
            pool=object(),
            user=make_user(Department.ADMIN),
        )
    )

    assert len(connection.executemany_calls) == 1
    assert connection.executemany_calls[0][1] == [
        ("stage_a", Department.ADMIN.value, 4),
        ("stage_b", Department.RD.value, 2),
    ]
    assert len(connection.execute_calls) == 1
    assert "UPDATE stages AS s" in connection.execute_calls[0][0]
    assert [row.stage_key for row in result] == ["stage_a", "stage_b"]
    assert result[0].responsible_dept == Department.ADMIN
    assert result[0].default_due_days == 4
    assert audit_calls and audit_calls[0] is not None
