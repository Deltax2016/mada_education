"""Request logging.

Coolify collects container stdout, so that is where everything goes, one line
per request. The line carries what is needed to answer "why was this slow" and
"which request produced that error" without opening a tracing tool: the method,
the path, the status, how long it took, and an id that the frontend passes
through so a page render and the API calls behind it can be tied together.

Sensitive values never appear. Paths are logged, query strings are not, because
that is where one-time codes and signed URLs end up.
"""

import json
import logging
import sys
import time
import uuid
from contextvars import ContextVar

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from .config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="")

# Health checks fire every fifteen seconds per container. Logging them buries
# everything else.
QUIET_PATHS = {"/health/live", "/health/ready"}


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname.lower(),
            "logger": record.name,
            "msg": record.getMessage(),
        }
        request_id = request_id_var.get()
        if request_id:
            payload["requestId"] = request_id
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        for key, value in getattr(record, "extra_fields", {}).items():
            payload[key] = value
        return json.dumps(payload, ensure_ascii=False)


def configure() -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())

    # uvicorn installs its own handlers, which would double every line.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers = []
        logger.propagate = True
    # Its access log duplicates the middleware below with less information.
    logging.getLogger("uvicorn.access").disabled = True


class RequestLogMiddleware(BaseHTTPMiddleware):
    def __init__(self, app):
        super().__init__(app)
        self.log = logging.getLogger("request")

    async def dispatch(self, request: Request, call_next):
        # Reuse the id the frontend generated so one browser action reads as one
        # chain across both services.
        request_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token = request_id_var.set(request_id)
        started = time.perf_counter()

        try:
            response = await call_next(request)
        except Exception:
            self.log.exception(
                "request failed",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "durationMs": round((time.perf_counter() - started) * 1000, 1),
                    }
                },
            )
            request_id_var.reset(token)
            raise

        duration = round((time.perf_counter() - started) * 1000, 1)
        response.headers["X-Request-Id"] = request_id

        if request.url.path not in QUIET_PATHS:
            self.log.log(
                logging.WARNING if response.status_code >= 500 else logging.INFO,
                f"{request.method} {request.url.path} {response.status_code}",
                extra={
                    "extra_fields": {
                        "method": request.method,
                        "path": request.url.path,
                        "status": response.status_code,
                        "durationMs": duration,
                    }
                },
            )

        request_id_var.reset(token)
        return response
