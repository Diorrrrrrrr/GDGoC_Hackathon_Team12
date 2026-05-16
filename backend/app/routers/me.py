from fastapi import APIRouter, Depends, HTTPException, status

from app.db import get_pool
from app.deps import CurrentUser, get_current_user
from app.schemas.auth import UserInfo

router = APIRouter(tags=["me"])


@router.get("/me", response_model=UserInfo)
async def read_me(user: CurrentUser = Depends(get_current_user)) -> UserInfo:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "select id, username, role, display_name from public.users where id = $1",
            user.id,
        )
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return UserInfo(
        id=str(row["id"]),
        username=row["username"],
        role=row["role"],
        display_name=row["display_name"],
    )
