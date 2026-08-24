"""RFC 9457 Problem Details.

The `code` is the contract: clients look it up in their own translations.
The server never ships user-facing Arabic or English strings for UI errors,
otherwise the same message has to be localised twice and a mobile client
cannot translate it at all.
"""

from fastapi import Request
from fastapi.responses import JSONResponse

BASE = "https://api.mada.example/errors/"


class AppError(Exception):
    def __init__(self, code: str, status: int = 400, detail: str = "", **meta):
        self.code = code
        self.status = status
        self.detail = detail
        self.meta = meta
        super().__init__(detail or code)


class NotFound(AppError):
    def __init__(self, detail: str = "Resource not found"):
        super().__init__("resource.not_found", 404, detail)


class Unauthenticated(AppError):
    def __init__(self, detail: str = "Authentication required"):
        super().__init__("auth.unauthenticated", 401, detail)


class Forbidden(AppError):
    def __init__(self, code: str = "auth.forbidden", detail: str = "Forbidden", **meta):
        super().__init__(code, 403, detail, **meta)


class Conflict(AppError):
    def __init__(self, code: str, detail: str = "", **meta):
        super().__init__(code, 409, detail, **meta)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status,
        media_type="application/problem+json",
        content={
            "type": BASE + exc.code.replace(".", "-"),
            "title": exc.code.replace(".", " ").replace("_", " ").title(),
            "status": exc.status,
            "code": exc.code,
            "detail": exc.detail,
            "instance": str(request.url.path),
            "meta": exc.meta or None,
        },
    )
