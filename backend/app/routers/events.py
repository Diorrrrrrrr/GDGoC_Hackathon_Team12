from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.db import get_pool
from app.deps import CurrentUser, get_current_user
from app.schemas.event import EventItem

router = APIRouter(tags=["events"])


@router.get("/events", response_model=list[EventItem])
async def list_events(
    elder_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
    user: CurrentUser = Depends(get_current_user),
) -> list[EventItem]:
    try:
        elder_uuid = UUID(elder_id)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid elder_id")

    pool = get_pool()
    async with pool.acquire() as conn:
        if user.id != str(elder_uuid):
            paired = await conn.fetchval(
                """
                select 1 from public.pairings
                 where elder_id = $1 and caregiver_id = $2
                """,
                elder_uuid,
                user.id,
            )
            if not paired:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN,
                    "Not paired with this elder",
                )

        rows = await conn.fetch(
            """
            select id, ts, alert_type, overall_severity, risk_score, features
              from public.events
             where elder_id = $1
             order by ts desc
             limit $2
            """,
            elder_uuid,
            limit,
        )

    return [
        EventItem(
            id=r["id"],
            elder_id=str(elder_uuid),
            ts=r["ts"],
            alert_type=r["alert_type"],
            overall_severity=r["overall_severity"],
            risk_score=r["risk_score"],
            features=r["features"] if isinstance(r["features"], dict) else {},
        )
        for r in rows
    ]
