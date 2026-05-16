from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class PairTokenResponse(BaseModel):
    token: str
    expires_at: datetime


class PairCompleteRequest(BaseModel):
    token: str


class PairCompleteResponse(BaseModel):
    elder_id: str
    elder_display_name: str | None = None


PairStatus = Literal["pending", "expired", "used"]


class PairStatusResponse(BaseModel):
    status: PairStatus
    caregiver_id: str | None = None
    caregiver_display_name: str | None = None
    paired_at: datetime | None = None


class PairingItem(BaseModel):
    elder_id: str
    elder_display_name: str | None = None
    paired_at: datetime
