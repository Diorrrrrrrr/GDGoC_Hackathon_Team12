from fastapi import APIRouter, Depends

from app.db import get_pool
from app.deps import CurrentUser, get_current_user
from app.schemas.pairing import PairingItem

router = APIRouter(tags=["pairings"])


@router.get("/pairings", response_model=list[PairingItem])
async def list_pairings(
    user: CurrentUser = Depends(get_current_user),
) -> list[PairingItem]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            select pr.elder_id, u.display_name as elder_display_name, pr.paired_at
              from public.pairings pr
              left join public.users u on u.id = pr.elder_id
             where pr.caregiver_id = $1
             order by pr.paired_at desc
            """,
            user.id,
        )
    return [
        PairingItem(
            elder_id=str(r["elder_id"]),
            elder_display_name=r["elder_display_name"],
            paired_at=r["paired_at"],
        )
        for r in rows
    ]
