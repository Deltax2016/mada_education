import hashlib
import secrets
import time
from datetime import datetime, timedelta, timezone

import jwt

from .config import settings

ALGO = "HS256"


def hash_token(raw: str) -> str:
    return hashlib.sha256(raw.encode()).hexdigest()


def new_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def create_access_token(user_id: str, roles: list[str], locale: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "roles": roles,
        "locale": locale,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(seconds=settings.jwt_access_ttl)).timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGO)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGO])
    except jwt.PyJWTError:
        return None


def now_ts() -> int:
    return int(time.time())
