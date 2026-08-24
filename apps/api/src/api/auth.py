"""Authentication.

Email is the only identity. A visitor asks for a one-time code, we mail it
through Resend, and verifying it both creates the account on first use and signs
them in. There is no password to forget, reset or leak.

The request endpoint answers identically whether or not the address is
registered, so it cannot be used to enumerate accounts.
"""

import re
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import select

from ..core.config import settings
from ..core.deps import DB, CurrentUser, Locale
from ..core.email import email_service
from ..core.errors import AppError, Conflict
from ..core.security import (
    create_access_token,
    create_refresh_token,
    hash_token,
    new_otp,
)
from ..models import OtpCode, Session, User

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


class CodeRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)


class CodeVerify(BaseModel):
    otpId: str
    code: str
    nameAr: str | None = None
    nameEn: str | None = None


def _tokens(user: User) -> dict:
    return {
        "accessToken": create_access_token(user.id, user.roles or ["student"], user.locale),
        "expiresIn": settings.jwt_access_ttl,
    }


def _user_out(user: User, locale: str) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "nameAr": user.name_ar,
        "nameEn": user.name_en,
        "displayName": user.display_name(locale) or user.email.split("@")[0],
        "avatarUrl": user.avatar_url,
        "locale": user.locale,
        "country": user.country,
        "roles": user.roles or ["student"],
    }


def _normalize_email(raw: str) -> str:
    return raw.strip().lower()


@router.post("/email/code")
async def request_code(payload: CodeRequest, db: DB, locale: Locale):
    email = _normalize_email(payload.email)
    if not EMAIL_RE.match(email):
        raise AppError("auth.email_invalid", 422, "That does not look like an email address")

    window = datetime.now(timezone.utc) - timedelta(minutes=15)
    recent = await db.execute(
        select(OtpCode).where(OtpCode.destination == email, OtpCode.created_at > window)
    )
    if len(recent.scalars().all()) >= 3:
        raise AppError("rate_limited", 429, "Too many codes requested", retryAfter=900)

    code = new_otp()
    otp = OtpCode(
        destination=email,
        purpose="login",
        channel="email",
        code_hash=hash_token(code),
        expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.otp_ttl),
    )
    db.add(otp)
    await db.commit()

    delivered = await email_service.send_login_code(email, code, locale)
    if not delivered:
        raise AppError("auth.email_send_failed", 502, "Could not send the code")

    out = {"otpId": otp.id, "expiresIn": settings.otp_ttl, "email": email}
    if settings.otp_echo_in_response:
        # Development only. Never set in production, see docker/compose.yaml.
        out["devCode"] = code
    return out


@router.post("/email/verify")
async def verify_code(payload: CodeVerify, db: DB, locale: Locale):
    result = await db.execute(select(OtpCode).where(OtpCode.id == payload.otpId))
    otp = result.scalar_one_or_none()
    if not otp or otp.consumed_at:
        raise AppError("auth.code_invalid", 401, "Code is not valid")

    expires = otp.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < datetime.now(timezone.utc):
        raise AppError("auth.code_expired", 401, "Code has expired")

    if otp.attempts >= settings.otp_max_attempts:
        raise AppError("auth.code_invalid", 401, "Too many attempts")

    if otp.code_hash != hash_token(payload.code):
        otp.attempts += 1
        await db.commit()
        raise AppError("auth.code_invalid", 401, "Code is not valid")

    otp.consumed_at = datetime.now(timezone.utc)

    result = await db.execute(select(User).where(User.email == otp.destination))
    user = result.scalar_one_or_none()
    is_new = user is None
    if is_new:
        user = User(
            email=otp.destination,
            email_verified_at=datetime.now(timezone.utc),
            name_ar=payload.nameAr,
            name_en=payload.nameEn,
            locale=locale,
        )
        db.add(user)
        await db.flush()
    elif user.email_verified_at is None:
        user.email_verified_at = datetime.now(timezone.utc)

    refresh = create_refresh_token()
    db.add(
        Session(
            user_id=user.id,
            refresh_token_hash=hash_token(refresh),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_refresh_ttl),
        )
    )
    await db.commit()

    return {
        **_tokens(user),
        "refreshToken": refresh,
        "isNewUser": is_new,
        "user": _user_out(user, locale),
    }


class RefreshIn(BaseModel):
    refreshToken: str


@router.post("/refresh")
async def refresh_token(payload: RefreshIn, db: DB, locale: Locale):
    token_hash = hash_token(payload.refreshToken)
    result = await db.execute(select(Session).where(Session.refresh_token_hash == token_hash))
    session = result.scalar_one_or_none()
    if not session:
        raise AppError("auth.refresh_invalid", 401, "Refresh token is not valid")

    if session.revoked_at:
        # Reuse of a rotated token means the token leaked. Kill the whole family.
        family = await db.execute(select(Session).where(Session.family_id == session.family_id))
        for s in family.scalars():
            s.revoked_at = datetime.now(timezone.utc)
        await db.commit()
        raise Conflict("auth.refresh_reused", "Session revoked")

    session.revoked_at = datetime.now(timezone.utc)
    new_refresh = create_refresh_token()
    db.add(
        Session(
            user_id=session.user_id,
            family_id=session.family_id,
            refresh_token_hash=hash_token(new_refresh),
            expires_at=datetime.now(timezone.utc) + timedelta(seconds=settings.jwt_refresh_ttl),
        )
    )
    result = await db.execute(select(User).where(User.id == session.user_id))
    user = result.scalar_one()
    await db.commit()
    return {**_tokens(user), "refreshToken": new_refresh, "user": _user_out(user, locale)}


@router.get("/me")
async def me(user: CurrentUser, locale: Locale):
    return _user_out(user, locale)
