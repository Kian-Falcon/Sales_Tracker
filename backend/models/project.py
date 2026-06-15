from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.common import Department, StagePhase, StageSnapshot, StageStatus
from models.stage import StageRead


class ProjectCreate(BaseModel):
    project_code: str = Field(min_length=1, max_length=50)
    name: str = Field(min_length=1, max_length=255)
    client: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=255)


class ProjectSummary(BaseModel):
    id: UUID
    project_code: str
    name: str
    client: str
    brand: str | None = None
    created_at: datetime
    is_archived: bool
    current_stage: StageSnapshot | None = None


class ProjectDetail(BaseModel):
    id: UUID
    project_code: str
    name: str
    client: str
    brand: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    is_archived: bool
    stages: list[StageRead]


class DashboardSummary(BaseModel):
    total_projects: int
    active_stages: int
    overdue_stages: int
    completed_stages: int


class ProjectExportRow(BaseModel):
    project_code: str
    project_name: str
    client: str
    brand: str | None = None
    project_status: str
    current_stage: str | None = None
    current_phase: StagePhase | None = None
    responsible_department: Department | None = None
    stage_status: StageStatus | None = None
    due_date: str | None = None
    eta: str
    pending_duration: str
    activated_at: datetime | None = None
    created_at: datetime
