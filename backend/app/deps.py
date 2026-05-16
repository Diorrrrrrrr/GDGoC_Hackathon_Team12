from dataclasses import dataclass

import jwt
from fastapi import HTTPException, Request, status
from jwt.exceptions import InvalidTokenError

from app.config import settings


@dataclass
class CurrentUser:
    id: str
    username: str
    role: str


def get_current_user(request: Request) -> CurrentUser:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")
    token = auth[7:].strip()
    try:
        payload = jwt.decode(
            token,
            settings.app_jwt_secret,
            algorithms=["HS256"],
        )
    except InvalidTokenError as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {e}")
    return CurrentUser(
        id=payload["sub"],
        username=payload["username"],
        role=payload["role"],
    )
