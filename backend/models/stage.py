from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.comment import CommentRead
from models.common import Department, StagePhase, StageStatus


class StageTemplate(BaseModel):
    stage_key: str
    phase: StagePhase
    name: str
    responsible_dept: Department
    sort_order: int
    default_due_days: int | None = None


class StageDueDateUpdate(BaseModel):
    due_date: date


class StageRead(BaseModel):
    id: UUID
    project_id: UUID
    stage_key: str
    phase: StagePhase
    name: str
    responsible_dept: Department
    status: StageStatus
    activated_at: datetime | None = None
    due_date: date | None = None
    completed_at: datetime | None = None
    completed_by: UUID | None = None
    sort_order: int
    comments: list[CommentRead] = Field(default_factory=list)
