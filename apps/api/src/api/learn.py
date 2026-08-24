"""The learning surface: lesson delivery, progress, enrolment."""

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from ..core import access
from ..core.deps import DB, CurrentUser, Locale, OptionalUser
from ..core.errors import AppError, Forbidden, NotFound
from ..core.i18n import pick, resolve
from ..core.storage import storage
from ..models import (
    Certificate,
    Course,
    Enrollment,
    Lesson,
    LessonProgress,
    MediaAsset,
    Module,
    Quiz,
)

router = APIRouter(prefix="/learn", tags=["learn"])

COMPLETION_THRESHOLD = 0.9


async def _progress_map(db: DB, user_id: str, course_id: str) -> dict[str, LessonProgress]:
    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user_id, LessonProgress.course_id == course_id
        )
    )
    return {p.lesson_id: p for p in result.scalars()}


@router.get("/courses")
async def my_courses(db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(
        select(Enrollment, Course)
        .join(Course, Course.id == Enrollment.course_id)
        .where(Enrollment.user_id == user.id, Enrollment.status.in_(("active", "completed")))
    )
    rows = result.all()
    out = []
    for enrollment, course in rows:
        progress = await _progress_map(db, user.id, course.id)
        lessons_result = await db.execute(
            select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.position)
        )
        lessons = list(lessons_result.scalars())
        done = sum(1 for x in lessons if progress.get(x.id) and progress[x.id].status == "completed")
        next_lesson = next(
            (x for x in lessons if not (progress.get(x.id) and progress[x.id].status == "completed")),
            lessons[0] if lessons else None,
        )
        out.append(
            {
                "courseId": course.id,
                "slug": course.slug,
                "title": pick(course.title, locale),
                "coverUrl": course.cover_url,
                "lessonsTotal": len(lessons),
                "lessonsCompleted": done,
                "progressPercent": round(done / len(lessons) * 100) if lessons else 0,
                "status": enrollment.status,
                "continueSlug": next_lesson.slug if next_lesson else None,
            }
        )
    return {"data": out}


@router.post("/courses/{slug}/enroll")
async def enroll(slug: str, db: DB, user: CurrentUser, locale: Locale):
    """Free courses enrol directly. Paid ones go through billing first."""
    result = await db.execute(select(Course).where(Course.slug == slug))
    course = result.scalar_one_or_none()
    if not course:
        raise NotFound("Course not found")
    if not course.is_free:
        raise Forbidden("access.paywall", "This course requires a purchase")

    existing = await db.execute(
        select(Enrollment).where(Enrollment.user_id == user.id, Enrollment.course_id == course.id)
    )
    enrollment = existing.scalar_one_or_none()
    if not enrollment:
        enrollment = Enrollment(
            user_id=user.id, course_id=course.id, source="manual", locale=locale
        )
        db.add(enrollment)
        course.students_count += 1
        await db.commit()
    return {"enrollmentId": enrollment.id, "status": enrollment.status}


@router.get("/courses/{slug}/outline")
async def outline(slug: str, db: DB, locale: Locale, user: OptionalUser):
    result = await db.execute(select(Course).where(Course.slug == slug))
    course = result.scalar_one_or_none()
    if not course:
        raise NotFound("Course not found")

    modules_result = await db.execute(
        select(Module).where(Module.course_id == course.id).order_by(Module.position)
    )
    lessons_result = await db.execute(
        select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.position)
    )
    lessons = list(lessons_result.scalars())
    progress = await _progress_map(db, user.id, course.id) if user else {}

    unlocked = await access.has_course_access(db, user, course)

    modules = []
    for module in modules_result.scalars():
        modules.append(
            {
                "id": module.id,
                "title": pick(module.title, locale),
                "lessons": [
                    {
                        "id": x.id,
                        "slug": x.slug,
                        "title": pick(x.title, locale),
                        "type": x.type,
                        "durationMinutes": x.duration_minutes,
                        "isPreview": x.is_preview,
                        "locked": not (unlocked or x.is_preview),
                        "status": progress[x.id].status if x.id in progress else "not_started",
                    }
                    for x in lessons
                    if x.module_id == module.id
                ],
            }
        )

    completed = sum(1 for p in progress.values() if p.status == "completed")
    return {
        "courseId": course.id,
        "slug": course.slug,
        "title": pick(course.title, locale),
        "modules": modules,
        "lessonsTotal": len(lessons),
        "lessonsCompleted": completed,
        "progressPercent": round(completed / len(lessons) * 100) if lessons else 0,
        "hasAccess": unlocked,
    }


@router.get("/courses/{course_slug}/lessons/{lesson_slug}")
async def get_lesson(course_slug: str, lesson_slug: str, db: DB, locale: Locale, user: OptionalUser):
    result = await db.execute(select(Course).where(Course.slug == course_slug))
    course = result.scalar_one_or_none()
    if not course:
        raise NotFound("Course not found")

    result = await db.execute(
        select(Lesson).where(Lesson.course_id == course.id, Lesson.slug == lesson_slug)
    )
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")

    verdict = await access.check(db, user, lesson, course)
    if not verdict.allowed:
        # The client needs to know *why* so it can show the right screen: a sign-in
        # prompt, a purchase page and an expired-access page are three different
        # things, and 401 versus 403 is what separates the first from the rest.
        raise AppError(
            verdict.code,
            verdict.status,
            "No access to this lesson",
            verdict=verdict.verdict,
        )

    version = next(
        (v for v in lesson.versions if v.locale == locale and v.status == "published"), None
    )
    is_fallback = False
    resolved_locale = locale
    if version is None:
        version = next((v for v in lesson.versions if v.status == "published"), None)
        if version:
            resolved_locale = version.locale
            is_fallback = True

    media = None
    if lesson.media_asset_id:
        asset_result = await db.execute(
            select(MediaAsset).where(MediaAsset.id == lesson.media_asset_id)
        )
        asset = asset_result.scalar_one_or_none()
        if asset:
            media = {
                "assetId": asset.id,
                "src": storage.presign_get(asset.storage_key, kind=asset.kind),
                "poster": asset.poster_url or (
                    storage.public_url(asset.poster_key) if asset.poster_key else None
                ),
                "durationSeconds": asset.duration_seconds,
                "subtitles": [
                    {"locale": k, "src": storage.presign_get(v, kind="subtitle")}
                    for k, v in (asset.subtitles or {}).items()
                ],
            }

    quiz_result = await db.execute(select(Quiz).where(Quiz.lesson_id == lesson.id))
    quiz = quiz_result.scalar_one_or_none()

    progress = None
    if user:
        p = await db.execute(
            select(LessonProgress).where(
                LessonProgress.user_id == user.id, LessonProgress.lesson_id == lesson.id
            )
        )
        row = p.scalar_one_or_none()
        if row:
            progress = {
                "status": row.status,
                "lastPositionSeconds": row.last_position_seconds,
                "watchedSeconds": row.watched_seconds,
                "blocksSeen": row.blocks_seen or [],
            }

    title, _, title_fallback = resolve(lesson.title, locale)
    return {
        "id": lesson.id,
        "slug": lesson.slug,
        "courseSlug": course.slug,
        "courseTitle": pick(course.title, locale),
        "title": title,
        "type": lesson.type,
        "durationMinutes": lesson.duration_minutes,
        "blocks": version.content if version else [],
        "media": media,
        "quizId": quiz.id if quiz else None,
        "progress": progress,
        "meta": {
            "locale": locale,
            "resolvedLocale": resolved_locale,
            "isFallback": is_fallback or title_fallback,
        },
    }


class ProgressIn(BaseModel):
    positionSeconds: float = 0
    watchedDelta: float = 0
    blocksSeen: list[str] = []


@router.post("/lessons/{lesson_id}/progress")
async def save_progress(lesson_id: str, payload: ProgressIn, db: DB, user: CurrentUser):
    """Idempotent heartbeat.

    Position takes the maximum rather than the latest value, so a packet that
    arrives late over a flaky mobile connection cannot rewind the student.
    Watched time is capped per interval so scrubbing does not inflate it.
    """
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")

    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id, LessonProgress.lesson_id == lesson_id
        )
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = LessonProgress(
            user_id=user.id, lesson_id=lesson_id, course_id=lesson.course_id
        )
        db.add(progress)

    progress.last_position_seconds = max(progress.last_position_seconds, payload.positionSeconds)
    progress.watched_seconds += min(payload.watchedDelta, 30)
    if payload.blocksSeen:
        progress.blocks_seen = sorted(set((progress.blocks_seen or []) + payload.blocksSeen))

    duration = lesson.duration_minutes * 60
    if duration:
        progress.progress_percent = min(100, progress.watched_seconds / duration * 100)
        if progress.progress_percent >= COMPLETION_THRESHOLD * 100 and progress.status != "completed":
            progress.status = "completed"
            progress.completed_at = datetime.now(timezone.utc)

    await db.commit()
    return {"status": progress.status, "progressPercent": round(progress.progress_percent)}


@router.post("/lessons/{lesson_id}/complete")
async def complete_lesson(lesson_id: str, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")

    result = await db.execute(
        select(LessonProgress).where(
            LessonProgress.user_id == user.id, LessonProgress.lesson_id == lesson_id
        )
    )
    progress = result.scalar_one_or_none()
    if not progress:
        progress = LessonProgress(
            user_id=user.id, lesson_id=lesson_id, course_id=lesson.course_id
        )
        db.add(progress)
    progress.status = "completed"
    progress.progress_percent = 100
    progress.completed_at = datetime.now(timezone.utc)
    await db.flush()

    certificate = await _maybe_issue_certificate(db, user, lesson.course_id, locale)
    await db.commit()
    return {"status": "completed", "certificate": certificate}


async def _maybe_issue_certificate(db, user, course_id: str, locale: str) -> dict | None:
    """One place decides eligibility, so the rule cannot drift between handlers."""
    lessons_result = await db.execute(
        select(Lesson).where(Lesson.course_id == course_id, Lesson.is_required == True)  # noqa: E712
    )
    required = list(lessons_result.scalars())
    if not required:
        return None

    progress = await _progress_map(db, user.id, course_id)
    if not all(progress.get(x.id) and progress[x.id].status == "completed" for x in required):
        return None

    existing = await db.execute(
        select(Certificate).where(
            Certificate.user_id == user.id, Certificate.course_id == course_id
        )
    )
    cert = existing.scalar_one_or_none()
    if cert:
        return {"serial": cert.serial_number, "isNew": False}

    serial = f"MADA-{datetime.now(timezone.utc):%Y}-{user.id[:4].upper()}{course_id[:4].upper()}"
    cert = Certificate(
        user_id=user.id,
        course_id=course_id,
        serial_number=serial,
        name_ar=user.name_ar,
        name_en=user.name_en,
        score_percent=100,
    )
    db.add(cert)

    enrollment_result = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.course_id == course_id
        )
    )
    enrollment = enrollment_result.scalar_one_or_none()
    if enrollment:
        enrollment.status = "completed"
        enrollment.completed_at = datetime.now(timezone.utc)
        enrollment.progress_percent = 100

    return {"serial": serial, "isNew": True}


@router.get("/certificates")
async def my_certificates(db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(
        select(Certificate, Course)
        .join(Course, Course.id == Certificate.course_id)
        .where(Certificate.user_id == user.id)
    )
    return {
        "data": [
            {
                "serial": cert.serial_number,
                "courseTitle": pick(course.title, locale),
                "courseSlug": course.slug,
                "issuedAt": cert.issued_at.isoformat(),
                "nameAr": cert.name_ar,
                "nameEn": cert.name_en,
                "scorePercent": cert.score_percent,
            }
            for cert, course in result.all()
        ]
    }
