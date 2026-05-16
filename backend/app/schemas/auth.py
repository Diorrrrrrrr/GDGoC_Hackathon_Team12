from typing import Literal

from pydantic import BaseModel, Field

UserRole = Literal["elder", "caregiver"]


class SignupRequest(BaseModel):
    username: str = Field(pattern=r"^[a-zA-Z0-9_]{3,20}$")
    password: str = Field(min_length=6, max_length=72)
    role: UserRole
    display_name: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class UserInfo(BaseModel):
    id: str
    username: str
    role: UserRole
    display_name: str | None = None


class AuthResponse(BaseModel):
    access_token: str
    user: UserInfo
