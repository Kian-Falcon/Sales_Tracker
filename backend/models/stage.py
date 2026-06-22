from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, Field

from models.comment import CommentRead
from models.common import Department, DueDateRequestStatus, StagePhase, StageStatus


class StageTemplate(BaseModel):
    stage_key: str
    phase: StagePhase
    name: str
    responsible_dept: Department
    sort_order: int
    default_due_days: int | None = None


class StageDueDateUpdate(BaseModel):
    due_date: date


class DueDateRequestAction(str, Enum):
    APPROVE = "approve"
    REJECT = "reject"


class StageDueDateChangeRequestCreate(BaseModel):
    requested_due_date: date
    reason: str = Field(min_length=1, max_length=2000)


class StageDueDateChangeRequestReview(BaseModel):
    action: DueDateRequestAction
    note: str | None = Field(default=None, max_length=2000)


class StageDueDateChangeRequestRead(BaseModel):
    id: UUID
    stage_id: UUID
    requested_by: UUID
    requested_by_department: Department
    requestor_name: str | None = None
    current_due_date: date | None = None
    requested_due_date: date
    reason: str
    status: DueDateRequestStatus = DueDateRequestStatus.PENDING
    reviewed_by: UUID | None = None
    reviewer_name: str | None = None
    review_note: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


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
    due_date_requests: list[StageDueDateChangeRequestRead] = Field(default_factory=list)
