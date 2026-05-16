import json
from uuid import UUID

import asyncpg
from fastapi import APIRouter

from app.db import get_pool
from app.schemas.event import AnalyzePayload, AnalyzeResponse

router = APIRouter(tags=["analyze"])


@router.post("/analyze", response_model=AnalyzeResponse)
async def analyze(body: AnalyzePayload) -> AnalyzeResponse:
    try:
        elder_id = UUID(body.user_id)
    except (ValueError, TypeError):
        return AnalyzeResponse(stored=False, reason="invalid_user_id")

    pool = get_pool()
    features_json = json.dumps(body.features)
    try:
        async with pool.acquire() as conn:
            if body.timestamp is None:
                await conn.execute(
                    """
                    insert into public.events
                      (elder_id, alert_type, overall_severity, risk_score, features)
                    values ($1, $2, $3, $4, $5::jsonb)
                    """,
                    elder_id,
                    body.alert_type,
                    body.overall_severity,
                    body.risk_score,
                    features_json,
                )
            else:
                await conn.execute(
                    """
                    insert into public.events
                      (elder_id, ts, alert_type, overall_severity, risk_score, features)
                    values ($1, $2, $3, $4, $5, $6::jsonb)
                    """,
                    elder_id,
                    body.timestamp,
                    body.alert_type,
                    body.overall_severity,
                    body.risk_score,
                    features_json,
                )
    except asyncpg.ForeignKeyViolationError:
        return AnalyzeResponse(stored=False, reason="unknown_elder")
    return AnalyzeResponse(stored=True)
