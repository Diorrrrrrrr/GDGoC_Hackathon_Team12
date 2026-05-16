from datetime import datetime, timedelta, timezone

import asyncpg
import bcrypt
import jwt
from fastapi import APIRouter, HTTPException, status

from app.config import settings
from app.db import get_pool
from app.schemas.auth import AuthResponse, LoginRequest, SignupRequest, UserInfo

router = APIRouter(prefix="/auth", tags=["auth"])

JWT_TTL = timedelta(days=7)


def _issue_token(user_id: str, username: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + JWT_TTL
    return jwt.encode(
        {"sub": user_id, "username": username, "role": role, "exp": exp},
        settings.app_jwt_secret,
        algorithm="HS256",
    )


@router.post("/signup", response_model=AuthResponse)
async def signup(body: SignupRequest) -> AuthResponse:
    pw_hash = bcrypt.hashpw(
        body.password.encode("utf-8"), bcrypt.gensalt()
    ).decode("utf-8")
    display_name = body.display_name or body.username
    pool = get_pool()
    try:
        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                insert into public.users (username, password_hash, role, display_name)
                values ($1, $2, $3, $4)
                returning id, username, role, display_name
                """,
                body.username,
                pw_hash,
                body.role,
                display_name,
            )
    except asyncpg.UniqueViolationError:
        raise HTTPException(status.HTTP_409_CONFLICT, "Username already taken")

    user_id = str(row["id"])
    token = _issue_token(user_id, row["username"], row["role"])
    return AuthResponse(
        access_token=token,
        user=UserInfo(
            id=user_id,
            username=row["username"],
            role=row["role"],
            display_name=row["display_name"],
        ),
    )


@router.post("/login", response_model=AuthResponse)
async def login(body: LoginRequest) -> AuthResponse:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            select id, username, password_hash, role, display_name
              from public.users
             where username = $1
            """,
            body.username,
        )
    if row is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")
    if not bcrypt.checkpw(
        body.password.encode("utf-8"),
        row["password_hash"].encode("utf-8"),
    ):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials")

    user_id = str(row["id"])
    token = _issue_token(user_id, row["username"], row["role"])
    return AuthResponse(
        access_token=token,
        user=UserInfo(
            id=user_id,
            username=row["username"],
            role=row["role"],
            display_name=row["display_name"],
        ),
    )
