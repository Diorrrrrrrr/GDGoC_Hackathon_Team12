from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_pool
from app.deps import CurrentUser, get_current_user
from app.schemas.pairing import (
    PairCompleteRequest,
    PairCompleteResponse,
    PairStatusResponse,
    PairTokenResponse,
)

router = APIRouter(prefix="/pair", tags=["pair"])

TOKEN_TTL = timedelta(minutes=5)


def _require_role(user: CurrentUser, expected: str) -> None:
    if user.role != expected:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            f"Requires role '{expected}', current role is '{user.role}'.",
        )


@router.post("/initiate", response_model=PairTokenResponse)
async def initiate(user: CurrentUser = Depends(get_current_user)) -> PairTokenResponse:
    _require_role(user, "elder")
    expires_at = datetime.now(timezone.utc) + TOKEN_TTL
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            insert into public.pair_tokens (elder_id, expires_at)
            values ($1, $2)
            returning token, expires_at
            """,
            user.id,
            expires_at,
        )
    return PairTokenResponse(token=str(row["token"]), expires_at=row["expires_at"])


@router.get("/status", response_model=PairStatusResponse)
async def status_(
    token: str, user: CurrentUser = Depends(get_current_user)
) -> PairStatusResponse:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            select t.elder_id, t.expires_at, t.used_at, t.used_by,
                   u.display_name as caregiver_display_name,
                   pr.paired_at
              from public.pair_tokens t
              left join public.users u on u.id = t.used_by
              left join public.pairings pr
                on pr.elder_id = t.elder_id and pr.caregiver_id = t.used_by
             where t.token = $1
            """,
            token,
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token not found")
    if str(row["elder_id"]) != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your token")

    if row["used_at"] is not None:
        return PairStatusResponse(
            status="used",
            caregiver_id=str(row["used_by"]) if row["used_by"] else None,
            caregiver_display_name=row["caregiver_display_name"],
            paired_at=row["paired_at"],
        )
    if row["expires_at"] < datetime.now(timezone.utc):
        return PairStatusResponse(status="expired")
    return PairStatusResponse(status="pending")


@router.post("/complete", response_model=PairCompleteResponse)
async def complete(
    body: PairCompleteRequest,
    user: CurrentUser = Depends(get_current_user),
) -> PairCompleteResponse:
    _require_role(user, "caregiver")
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                """
                update public.pair_tokens
                   set used_at = now(), used_by = $2
                 where token = $1
                   and used_at is null
                   and expires_at > now()
                returning elder_id
                """,
                body.token,
                user.id,
            )
            if row is None:
                raise HTTPException(
                    status.HTTP_410_GONE,
                    "Token is invalid, expired, or already used",
                )
            elder_id = row["elder_id"]
            await conn.execute(
                """
                insert into public.pairings (elder_id, caregiver_id)
                values ($1, $2)
                on conflict (elder_id, caregiver_id) do nothing
                """,
                elder_id,
                user.id,
            )
            elder_row = await conn.fetchrow(
                "select display_name from public.users where id = $1",
                elder_id,
            )
    return PairCompleteResponse(
        elder_id=str(elder_id),
        elder_display_name=elder_row["display_name"] if elder_row else None,
    )
