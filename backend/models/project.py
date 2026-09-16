from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field

from models.common import Department, ProjectDocumentType, ProjectPriority, StagePhase, StageSnapshot, StageStatus
from models.stage import StageRead


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    client: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=255)
    assigned_person_name: str = Field(min_length=1, max_length=255)
    assigned_person_email: EmailStr | None = None
    priority: ProjectPriority = ProjectPriority.NORMAL
    estimated_tat_days: int = Field(ge=1, le=3650)
    total_order_value: float = Field(ge=0)
    dispatch_date: date | None = None
    number_of_stores: int | None = Field(default=None, ge=1, le=100000)
    special_request: str | None = Field(default=None, max_length=2000)


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    client: str | None = Field(default=None, min_length=1, max_length=255)
    assigned_person_name: str | None = Field(default=None, min_length=1, max_length=255)
    priority: ProjectPriority | None = None
    estimated_tat_days: int | None = Field(default=None, ge=1, le=3650)
    total_order_value: float | None = Field(default=None, ge=0)
    dispatch_date: date | None = None
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
    dispatch_date: date | None = None
    number_of_stores: int | None = None
    completed_stages: int = 0
    total_stages: int = 0
    created_at: datetime
    is_archived: bool
    current_stage: StageSnapshot | None = None


class ProjectWorkspaceStatusFilter(str, Enum):
    ALL = "all"
    ACTIVE = "active"
    OVERDUE = "overdue"
    DONE = "done"


class ProjectWorkspaceSort(str, Enum):
    CREATED_DESC = "created-desc"
    CREATED_ASC = "created-asc"
    DUE_ASC = "due-asc"
    PRIORITY = "priority"
    VALUE_DESC = "value-desc"


class ProjectWorkspaceSummary(BaseModel):
    total: int = 0
    active: int = 0
    overdue: int = 0
    completed: int = 0


class ProjectWorkspacePresetCounts(BaseModel):
    all: int = 0
    active: int = 0
    my_team: int = 0
    overdue: int = 0
    recent: int = 0
    completed: int = 0


class ProjectWorkspaceMeta(BaseModel):
    client_options: list[str] = Field(default_factory=list)
    department_options: list[Department] = Field(default_factory=list)
    summary: ProjectWorkspaceSummary = Field(default_factory=ProjectWorkspaceSummary)
    preset_counts: ProjectWorkspacePresetCounts = Field(default_factory=ProjectWorkspacePresetCounts)


class ProjectWorkspacePage(BaseModel):
    items: list[ProjectSummary] = Field(default_factory=list)
    total_count: int = 0
    page: int = 1
    page_size: int = 0
    total_pages: int = 1
    paginated: bool = True


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
    dispatch_date: date | None = None
    number_of_stores: int | None = None
    special_request: str | None = None
    created_by: UUID | None = None
    created_by_name: str | None = None
    created_by_department: Department | None = None
    created_at: datetime
    is_archived: bool
    enabled_stage_keys: list[str] = Field(default_factory=list)
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
    dispatch_date: str | None = None
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
