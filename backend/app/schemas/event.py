from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel


Severity = Literal["low", "medium", "high"]


class AnalyzePayload(BaseModel):
    user_id: str
    timestamp: datetime | None = None
    alert_type: str
    overall_severity: Severity
    risk_score: float
    features: dict[str, Any]


class AnalyzeResponse(BaseModel):
    stored: bool
    reason: str | None = None


class EventItem(BaseModel):
    id: int
    elder_id: str
    ts: datetime
    alert_type: str
    overall_severity: Severity
    risk_score: float
    features: dict[str, Any]
