"""Media upload and playback.

Uploads bypass the API entirely: the browser gets a presigned URL and writes
straight to the bucket. Playback URLs are short-lived and issued only after an
access check, so paid video has no stable public URL.
"""

import uuid

from fastapi import APIRouter, Request, Response
from pydantic import BaseModel
from sqlalchemy import select

from ..core.config import settings
from ..core.deps import DB, CurrentUser
from ..core.errors import AppError, Forbidden, NotFound
from ..core.storage import storage
from ..models import Course, Lesson, MediaAsset

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED = {
    "video": {"video/mp4", "video/webm", "video/quicktime"},
    "image": {"image/jpeg", "image/png", "image/webp", "image/avif"},
    "document": {"application/pdf"},
    "subtitle": {"text/vtt"},
}
MAX_BYTES = {"video": 5_000_000_000, "image": 20_000_000, "document": 100_000_000,
             "subtitle": 2_000_000}


class UploadRequest(BaseModel):
    kind: str
    filename: str
    mimeType: str
    sizeBytes: int
    locale: str | None = None


@router.post("/uploads")
async def create_upload(payload: UploadRequest, db: DB, user: CurrentUser):
    if not ({"admin", "instructor"} & set(user.roles or [])):
        raise Forbidden(detail="Only staff can upload media")
    if payload.kind not in ALLOWED:
        raise AppError("upload.unsupported_kind", 422, "Unsupported media kind")
    if payload.mimeType not in ALLOWED[payload.kind]:
        raise AppError("upload.unsupported_type", 422, f"{payload.mimeType} is not allowed")
    if payload.sizeBytes > MAX_BYTES[payload.kind]:
        raise AppError("upload.too_large", 413, "File exceeds the limit")

    asset_id = str(uuid.uuid4())
    ext = payload.filename.rsplit(".", 1)[-1].lower() if "." in payload.filename else "bin"
    key = f"media/{payload.kind}/{asset_id}/original.{ext}"

    asset = MediaAsset(
        id=asset_id,
        kind=payload.kind,
        locale=payload.locale,
        storage_key=key,
        mime_type=payload.mimeType,
        size_bytes=payload.sizeBytes,
        status="uploading",
    )
    db.add(asset)
    await db.commit()

    presigned = storage.presign_put(key, payload.mimeType)
    return {"assetId": asset_id, "storageKey": key, **presigned}


@router.post("/uploads/{asset_id}/complete")
async def complete_upload(asset_id: str, db: DB, user: CurrentUser):
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset:
        raise NotFound("Asset not found")
    # A real deployment queues probe + poster + transcode here.
    asset.status = "ready"
    await db.commit()
    return {"assetId": asset.id, "status": asset.status}


@router.get("/assets/{asset_id}/playback")
async def playback(asset_id: str, db: DB, user: CurrentUser):
    result = await db.execute(select(MediaAsset).where(MediaAsset.id == asset_id))
    asset = result.scalar_one_or_none()
    if not asset or asset.status != "ready":
        raise NotFound("Asset not available")

    lesson_result = await db.execute(select(Lesson).where(Lesson.media_asset_id == asset_id))
    lesson = lesson_result.scalar_one_or_none()
    if lesson:
        from ..core import access

        course_result = await db.execute(select(Course).where(Course.id == lesson.course_id))
        course = course_result.scalar_one()
        verdict = await access.check(db, user, lesson, course)
        if not verdict.allowed:
            raise AppError(verdict.code, verdict.status, "No access to this media")

    return {
        "src": storage.presign_get(asset.storage_key),
        "poster": asset.poster_url,
        "expiresIn": settings.signed_url_ttl,
        "watermark": {"text": user.display_name("en") or user.email},
    }


# --- local storage fallback so the stack runs without MinIO or R2 ------------


@router.put("/local-upload/{key:path}")
async def local_upload(key: str, request: Request):
    if not storage.local:
        raise NotFound("Local upload disabled")
    storage.write_local(key, await request.body())
    return {"ok": True}


@router.get("/local/{key:path}")
async def local_download(key: str):
    if not storage.local:
        raise NotFound("Local download disabled")
    try:
        data, mime = storage.read_local(key)
    except FileNotFoundError:
        raise NotFound("Object not found") from None
    return Response(content=data, media_type=mime)
