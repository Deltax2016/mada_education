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
    """Keep trying to reach the database, then report what actually went wrong.

    Every failure is retried, DNS included. A container alias on a shared Docker
    network is not resolvable the instant the process starts, and treating that
    first lookup as fatal turns a normal startup race into a restart loop that
    never recovers.

    The retry window is deliberately longer than the healthcheck's start period,
    so a slow database shows up as one honest error rather than a container that
    dies and is restarted mid-diagnosis.
    """
    import asyncio
    import socket
    from urllib.parse import urlsplit

    host = urlsplit(settings.database_url).hostname or "(none)"
    delays = [1, 2, 3, 5, 8, 8, 8, 8, 8]  # about a minute in total
    last: Exception | None = None

    for attempt, delay in enumerate(delays + [0], start=1):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
            if attempt > 1:
                log.info(
                    f"database reachable after {attempt} attempts",
                    extra={"extra_fields": {"host": host}},
                )
            return
        except Exception as error:  # noqa: BLE001 - reported below with context
            last = error
            log.warning(
                f"database not reachable yet ({attempt}/{len(delays) + 1})",
                extra={
                    "extra_fields": {
                        "host": host,
                        "cause": type(error).__name__,
                        "error": str(error)[:200],
                    }
                },
            )
            if delay:
                await asyncio.sleep(delay)

    text = str(last)
    if isinstance(last, socket.gaierror) or "Name or service not known" in text:
        detail = (
            f"the hostname {host!r} never resolved. The database container is either "
            "not running, or it is not on a network this container can see. Check "
            "that the database resource is started, and that this application is "
            "attached to the same network."
        )
    elif "Connection refused" in text:
        detail = (
            f"{host!r} resolves but refused the connection. Something is listening "
            "elsewhere: check the port, and that the database is actually started."
        )
    elif "password authentication failed" in text or "InvalidPassword" in text:
        detail = "the host is reachable and the credentials were rejected. Check DATABASE_URL."
    elif "does not exist" in text:
        detail = "the host is reachable and the database name does not exist. Check DATABASE_URL."
    else:
        detail = f"giving up after {len(delays) + 1} attempts."

    log.error(
        f"cannot reach the database: {detail}",
        extra={"extra_fields": {"host": host, "error": text[:400]}},
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
    log = logging.getLogger("startup")
    await _wait_for_database(log)

    # A fresh deployment has empty tables and therefore no catalogue, which looks
    # like a broken site rather than a new one. Loading only when the catalogue is
    # completely empty makes this a one time bootstrap that never touches a
    # catalogue anyone has since curated.
    from .content_loader import load_if_empty, refresh_placeholder_art
    from .core.db import SessionLocal

    async with SessionLocal() as db:
        result = await load_if_empty(db)
        repaired = await refresh_placeholder_art(db)
        if repaired:
            log.info("replaced %d placeholder images with drawn art", repaired)
    if result:
        log.info(
            f"loaded {len(result['added'])} courses into an empty catalogue",
            extra={"extra_fields": {"courses": result["added"]}},
        )

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
    from sqlalchemy import func, select, text

    from .content_loader import CONTENT_DIR, read_content
    from .models import Course

    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
        published = await conn.execute(
            select(func.count()).select_from(Course.__table__).where(
                Course.__table__.c.status == "published"
            )
        )
        course_count = published.scalar_one()

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
        # The catalogue and the sender address are the two things that look
        # broken from outside without saying why, so they are reported here
        # rather than requiring a shell in the container.
        "coursesPublished": course_count,
        "contentAvailable": len(read_content()),
        "contentDir": str(CONTENT_DIR) if CONTENT_DIR.exists() else "MISSING",
        # Not a secret, and the usual failure is that it arrived mangled or empty.
        "mailFrom": settings.mail_from,
    }
