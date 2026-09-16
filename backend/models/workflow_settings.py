from datetime import datetime

from pydantic import BaseModel, Field

from models.common import Department, StagePhase


class WorkflowStageSettingRead(BaseModel):
    stage_key: str
    phase: StagePhase
    name: str
    responsible_dept: Department
    sort_order: int
    is_enabled: bool = True
    default_due_days: int | None = Field(default=None, ge=0)
    updated_at: datetime | None = None


class WorkflowStageSettingUpdate(BaseModel):
    stage_key: str
    responsible_dept: Department
    is_enabled: bool = True
    default_due_days: int | None = Field(default=None, ge=0)


class WorkflowStageSettingUpdateRequest(BaseModel):
    settings: list[WorkflowStageSettingUpdate] = Field(min_length=1)
