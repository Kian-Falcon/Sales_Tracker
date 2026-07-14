from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.common import Department, ProjectDocumentType, ProjectPriority, StagePhase, StageSnapshot, StageStatus
from models.stage import StageRead


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    client: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=255)
    assigned_person_name: str = Field(min_length=1, max_length=255)
    priority: ProjectPriority = ProjectPriority.NORMAL
    estimated_tat_days: int = Field(ge=1, le=3650)
    total_order_value: float = Field(ge=0)
    number_of_stores: int | None = Field(default=None, ge=1, le=100000)
    special_request: str | None = Field(default=None, max_length=2000)


class ProjectUpdate(BaseModel):
    assigned_person_name: str = Field(min_length=1, max_length=255)
    priority: ProjectPriority = ProjectPriority.NORMAL
    estimated_tat_days: int | None = Field(default=None, ge=1, le=3650)
    total_order_value: float | None = Field(default=None, ge=0)
    number_of_stores: int | None = Field(default=None, ge=1, le=100000)
    special_request: str | None = Field(default=None, max_length=2000)


class ProjectDocumentRead(BaseModel):
    id: UUID
    project_id: UUID
    document_type: ProjectDocumentType
    file_name: str
    content_type: str
    file_size: int
    storage_bucket: str
    storage_path: str
    uploaded_by: UUID | None = None
    uploaded_by_name: str | None = None
    download_url: str | None = None
    created_at: datetime


class ProjectSummary(BaseModel):
    id: UUID
    project_code: str
    name: str
    client: str
    brand: str | None = None
    assigned_person_name: str | None = None
    priority: ProjectPriority = ProjectPriority.NORMAL
    estimated_tat_days: int | None = None
    total_order_value: float | None = None
    number_of_stores: int | None = None
    created_at: datetime
    is_archived: bool
    current_stage: StageSnapshot | None = None


class ProjectDetail(BaseModel):
    id: UUID
    project_code: str
    name: str
    client: str
    brand: str | None = None
    assigned_person_name: str | None = None
    priority: ProjectPriority = ProjectPriority.NORMAL
    estimated_tat_days: int | None = None
    total_order_value: float | None = None
    number_of_stores: int | None = None
    special_request: str | None = None
    created_by: UUID | None = None
    created_by_name: str | None = None
    created_by_department: Department | None = None
    created_at: datetime
    is_archived: bool
    documents: list[ProjectDocumentRead] = Field(default_factory=list)
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
    assigned_person_name: str | None = None
    priority: ProjectPriority
    estimated_tat_days: int | None = None
    total_order_value: float | None = None
    number_of_stores: int | None = None
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
