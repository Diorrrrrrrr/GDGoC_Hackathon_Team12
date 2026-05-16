from typing import Literal

from pydantic import BaseModel

ProfileRole = Literal["elder", "caregiver"]


class Me(BaseModel):
    id: str
    email: str | None = None
    role: str
    profile_role: ProfileRole | None = None
    display_name: str | None = None


class UpsertProfileRequest(BaseModel):
    role: ProfileRole
    display_name: str | None = None
