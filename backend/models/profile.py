from uuid import UUID

from pydantic import BaseModel, EmailStr

from models.common import Department


class MentionableProfileRead(BaseModel):
    id: UUID
    display_name: str
    email: EmailStr
    department: Department
