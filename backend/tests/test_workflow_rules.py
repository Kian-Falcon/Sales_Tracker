import asyncio
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from fastapi import HTTPException

from models.comment import CommentCreate
from models.common import CurrentUser, Department, StagePhase, StageStatus
from models.project import ProjectCreate
from models.stage import StageDueDateUpdate, StageTemplate
from models.workflow_settings import WorkflowStageSettingUpdate, WorkflowStageSettingUpdateRequest
from routers import comments, projects, stages, workflow_settings


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

    async def fetchrow(self, sql: str, *args):
        if "INSERT INTO projects" in sql:
            self.project = {
                "id": self.project_id,
                "project_code": args[0],
                "name": args[1],
                "client": args[2],
                "brand": args[3],
                "created_by": args[4],
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

        raise AssertionError(f"Unexpected fetch SQL: {sql}")


class StageWorkflowConnection:
    def __init__(self, current_stage: dict, next_stage: dict | None = None) -> None:
        self.current_stage = current_stage
        self.next_stage = next_stage
        self.execute_calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args):
        if "SELECT * FROM stages WHERE id = $1" in sql:
            return self.current_stage

        if "WHERE project_id = $1" in sql and "sort_order > $2" in sql:
            return self.next_stage

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")

    async def execute(self, sql: str, *args):
        self.execute_calls.append((sql, args))
        return "UPDATE 1"


class CommentPool:
    def __init__(self, stage: dict, inserted_comment: dict | None = None) -> None:
        self.stage = stage
        self.inserted_comment = inserted_comment
        self.calls: list[tuple[str, tuple]] = []

    async def fetchrow(self, sql: str, *args):
        self.calls.append((sql, args))
        if "SELECT * FROM stages WHERE id = $1" in sql:
            return self.stage

        if "WITH inserted AS" in sql:
            return self.inserted_comment

        raise AssertionError(f"Unexpected fetchrow SQL: {sql}")


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

    result = run_async(
        projects.create_project(
            ProjectCreate(project_code="P-100", name="Chair Program", client="Acme", brand="Kian"),
            pool=object(),
            user=make_user(Department.SALES),
        )
    )

    assert len(result.stages) == 2
    assert result.stages[0].stage_key == "costing_sop_logged"
    assert result.stages[0].status == StageStatus.ACTIVE
    assert result.stages[0].due_date == date.today() + timedelta(days=1)
    assert result.stages[0].activated_at is not None
    assert result.stages[1].stage_key == "costing_shared_rd"
    assert result.stages[1].status == StageStatus.PENDING
    assert result.stages[1].due_date is None
    assert result.stages[1].activated_at is None


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

    async def fake_load_project_detail(_connection, project_id):
        return {"project_id": str(project_id), "refreshed": True}

    monkeypatch.setattr(stages, "get_due_days_by_stage_key", fake_due_days)
    monkeypatch.setattr(stages, "load_project_detail", fake_load_project_detail)

    user = make_user(Department.RD)
    result = run_async(
        stages.complete_stage(
            current["id"],
            pool=object(),
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
    assert "Only Admin can change an existing date" in exc.value.detail
    assert connection.execute_calls == []


def test_admin_can_override_a_due_date(monkeypatch) -> None:
    current = stage_row(due_date=date.today())
    connection = StageWorkflowConnection(current_stage=current)
    patch_transaction(monkeypatch, stages, connection)
    audit_calls: list = []
    patch_audit_actor(monkeypatch, stages, audit_calls)

    async def fake_load_project_detail(_connection, project_id):
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
    assert connection.execute_calls == [
        ("UPDATE stages SET due_date = $2 WHERE id = $1", (current["id"], new_due_date))
    ]
    assert audit_calls and audit_calls[0] is not None


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
            user=user,
        )
    )

    assert result.author_name == "Sales Lead"
    assert result.department == Department.SALES
    assert result.text == "Client approved the costing."
    assert len(pool.calls) == 2
    assert audit_calls == [user.user_id]


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
