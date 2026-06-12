from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from models.common import Department


class CommentCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class CommentRead(BaseModel):
    id: UUID
    stage_id: UUID
    user_id: UUID
    department: Department
    author_name: str
    text: str
    created_at: datetime
