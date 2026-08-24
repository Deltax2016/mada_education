from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import auth, billing, catalog, learn, media, public, quiz, teach
from .core.config import settings
from .core.db import Base, engine
from .core.errors import AppError, app_error_handler
from .core.logging import RequestLogMiddleware, configure as configure_logging


configure_logging()


async def _wait_for_database(log) -> None:
    """Connect with a short backoff, then say plainly what is wrong.

    A database that is not up yet is normal during orchestration, so a few
    retries are worth it. A hostname that does not resolve will never resolve,
    and the useful output there is one sentence naming the host, not thirty
    lines of driver traceback that end in gaierror.
    """
    import asyncio
    import socket
    from urllib.parse import urlsplit

    host = urlsplit(settings.database_url).hostname or "(none)"
    last: Exception | None = None

    for attempt in range(1, 6):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            return
        except Exception as error:  # noqa: BLE001 - re-raised below with context
            last = error
            unresolvable = isinstance(error, socket.gaierror) or "Name or service not known" in str(
                error
            )
            if unresolvable:
                log.error(
                    f"database host {host!r} does not resolve from this container. "
                    "On Coolify the database is a separate resource with its own "
                    "network: use the internal hostname it shows and connect this "
                    "application to that network, or use its public host and port.",
                    extra={"extra_fields": {"host": host, "attempt": attempt}},
                )
                raise SystemExit(1)
            log.warning(
                f"database not reachable yet, retrying ({attempt}/5)",
                extra={"extra_fields": {"host": host, "error": str(error)[:160]}},
            )
            await asyncio.sleep(attempt * 2)

    log.error(
        f"could not reach the database at {host!r} after five attempts",
        extra={"extra_fields": {"host": host, "error": str(last)[:300]}},
    )
    raise SystemExit(1)


@asynccontextmanager
async def lifespan(app: FastAPI):
    import logging

    logging.getLogger("startup").info(
        "starting",
        extra={
            "extra_fields": {
                "env": settings.app_env,
                "database": settings.database_url.split("://")[0],
                "storage": "s3" if settings.storage_configured else "local",
                "email": "resend" if settings.resend_api_key else "console",
            }
        },
    )
    await _wait_for_database(logging.getLogger("startup"))
    yield
    await engine.dispose()


app = FastAPI(
    title="Mada Education API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs",
)

# Outermost, so it sees the status that actually reaches the client.
app.add_middleware(RequestLogMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.app_url, "http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_exception_handler(AppError, app_error_handler)

for router in (
    auth.router,
    catalog.router,
    learn.router,
    quiz.router,
    media.router,
    billing.router,
    public.router,
    teach.router,
):
    app.include_router(router, prefix="/api/v1")


@app.get("/health/live")
async def live():
    return {"status": "ok"}


@app.get("/health/ready")
async def ready():
    from sqlalchemy import text

    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {
        "status": "ok",
        "env": settings.app_env,
        "locales": settings.locales,
        "storage": "s3" if settings.storage_configured else "local",
        "email": "resend" if settings.resend_api_key else "console",
        # Reads what is actually wired, not what is present in the environment.
        # Payments say "unimplemented" when credentials exist because the
        # provider call does not, and that difference matters before launch.
        "payments": (
            "unimplemented"
            if settings.payments_configured
            else "demo"
            if settings.demo_checkout
            else "disabled"
        ),
        "loginCodeEcho": settings.otp_echo_in_response,
    }
