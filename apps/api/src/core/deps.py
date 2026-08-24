from typing import Annotated

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import User
from .db import get_db
from .errors import Unauthenticated
from .i18n import normalize_locale
from .security import decode_access_token

DB = Annotated[AsyncSession, Depends(get_db)]


async def get_locale(
    request: Request,
    accept_language: str | None = Header(default=None, alias="Accept-Language"),
) -> str:
    """Explicit ?locale= wins over the header, which wins over the default."""
    q = request.query_params.get("locale")
    return normalize_locale(q or accept_language)


Locale = Annotated[str, Depends(get_locale)]


async def _user_from_request(request: Request, db: AsyncSession) -> User | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    payload = decode_access_token(header[7:])
    if not payload:
        return None
    result = await db.execute(select(User).where(User.id == payload["sub"]))
    return result.scalar_one_or_none()


async def current_user_optional(request: Request, db: DB) -> User | None:
    return await _user_from_request(request, db)


async def current_user(request: Request, db: DB) -> User:
    user = await _user_from_request(request, db)
    if not user or user.status != "active":
        raise Unauthenticated()
    return user


CurrentUser = Annotated[User, Depends(current_user)]
OptionalUser = Annotated[User | None, Depends(current_user_optional)]
