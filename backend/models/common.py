from datetime import date, datetime
from enum import Enum
from uuid import UUID

from pydantic import BaseModel, EmailStr


class Department(str, Enum):
    SALES = "Sales"
    RD = "R&D"
    PRODUCTION = "Production"
    PROCUREMENT = "Procurement"
    QC = "QC"
    DISPATCH = "Dispatch"
    ADMIN = "Admin"


class ProjectPriority(str, Enum):
    NORMAL = "normal"
    ACCELERATED = "accelerated"


class ProjectDocumentType(str, Enum):
    BOQ = "boq"
    ATTACHMENT = "attachment"


class StagePhase(str, Enum):
    COSTING = "costing"
    DRAWING = "drawing"
    SAMPLING = "sampling"
    PRODUCTION = "production"


class StageStatus(str, Enum):
    PENDING = "pending"
    ACTIVE = "active"
    OVERDUE = "overdue"
    DONE = "done"


class DueDateRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class CurrentUser(BaseModel):
    user_id: UUID
    department: Department
    email: EmailStr | None = None


class StageSnapshot(BaseModel):
    id: UUID
    name: str
    phase: StagePhase
    responsible_dept: Department
    status: StageStatus
    activated_at: datetime | None = None
    due_date: date | None = None


class TimestampedModel(BaseModel):
    created_at: datetime
