from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.common import Department, ProjectPriority


class MonthlyReportOverview(BaseModel):
    projects_in_scope: int
    projects_created: int
    active_projects: int
    overdue_projects: int
    completed_projects: int
    stages_completed: int
    overdue_events: int
    comments_logged: int
    total_pipeline_value: float
    stores_in_scope: int


class MonthlyDepartmentReportRow(BaseModel):
    department: Department
    total_stages: int
    completed_total: int
    completed_this_month: int
    active_now: int
    overdue_now: int
    pending_now: int
    completion_rate: float
    avg_completion_days: float | None = None
    avg_delay_days: float | None = None


class MonthlyProjectReportRow(BaseModel):
    project_id: UUID
    project_code: str
    project_name: str
    client: str
    brand: str | None = None
    priority: ProjectPriority
    assigned_person_name: str | None = None
    total_order_value: float | None = None
    number_of_stores: int | None = None
    created_at: datetime
    status_label: str
    current_stage_name: str | None = None
    current_stage_department: Department | None = None
    current_stage_status: str | None = None
    current_stage_due_date: date | None = None
    total_stages: int
    completed_stages: int
    active_stages: int
    overdue_stages: int
    pending_stages: int
    completed_this_month: int
    completion_rate: float
    current_delay_days: int | None = None


class MonthlyReportTrendPoint(BaseModel):
    label: str
    period_start: date
    period_end: date
    projects_created: int
    stages_completed: int
    overdue_events: int
    comments_logged: int


class MonthlyAuditEvent(BaseModel):
    event_id: UUID
    changed_at: datetime
    project_id: UUID
    project_code: str
    project_name: str
    stage_name: str | None = None
    event_type: str
    actor_name: str
    actor_email: str | None = None
    details: str


class MonthlyReportRead(BaseModel):
    month: str
    period_start: date
    period_end: date
    generated_at: datetime
    overview: MonthlyReportOverview
    departments: list[MonthlyDepartmentReportRow] = Field(default_factory=list)
    projects: list[MonthlyProjectReportRow] = Field(default_factory=list)
    trends: list[MonthlyReportTrendPoint] = Field(default_factory=list)
    audit_events: list[MonthlyAuditEvent] = Field(default_factory=list)
