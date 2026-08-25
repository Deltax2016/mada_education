"""The author side of the platform.

Becoming an author is self-serve: any signed-in person fills a short profile and
gets the `instructor` role. The gate is not on who may write, it is on what gets
published, because a course only becomes visible when its author publishes it and
only a course with real lessons can be published at all.

Every route here resolves the course through `_owned`, which is the single place
that decides whether this person may touch this course.
"""

from datetime import datetime, timezone

from fastapi import APIRouter
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from ..core.deps import DB, CurrentUser
from ..core.errors import AppError, Forbidden, NotFound
from ..core.i18n import pick
from ..core.money import Money
from ..models import (
    Category,
    Course,
    Enrollment,
    Lesson,
    LessonProgress,
    LessonVersion,
    MediaAsset,
    Module,
    Review,
    User,
)

router = APIRouter(prefix="/teach", tags=["teach"])

LOCALES = ("ar", "en")


def _is_instructor(user: User) -> bool:
    return bool({"instructor", "admin"} & set(user.roles or []))


def _require_instructor(user: User) -> None:
    if not _is_instructor(user):
        raise Forbidden("teach.not_an_instructor", "This area is for course authors")


async def _owned(db: DB, user: User, slug: str) -> Course:
    """Fetch a course this person is allowed to edit, or refuse.

    Existence and ownership are answered together and with the same error, so the
    endpoint cannot be used to discover which slugs are taken.
    """
    _require_instructor(user)
    result = await db.execute(select(Course).where(Course.slug == slug))
    course = result.scalar_one_or_none()
    is_admin = "admin" in (user.roles or [])
    if not course or (course.instructor_id != user.id and not is_admin):
        raise NotFound("Course not found")
    return course


# --------------------------------------------------------------------- become


class ApplyIn(BaseModel):
    nameAr: str = Field(min_length=2, max_length=160)
    nameEn: str = Field(min_length=2, max_length=160)
    headlineAr: str = Field(min_length=4, max_length=160)
    headlineEn: str = Field(min_length=4, max_length=160)
    bioAr: str = Field(min_length=40, max_length=1200)
    bioEn: str = Field(min_length=40, max_length=1200)


@router.get("/status")
async def status(user: CurrentUser):
    return {
        "isInstructor": _is_instructor(user),
        "nameAr": user.name_ar,
        "nameEn": user.name_en,
        "headline": user.headline or {},
        "bio": user.bio or {},
    }


@router.post("/apply")
async def apply(payload: ApplyIn, db: DB, user: CurrentUser):
    """Grants the instructor role straight away.

    The author profile is required first because it is what a learner sees next to
    the course, and because an empty profile is the most common reason a good course
    does not sell.
    """
    user.name_ar = payload.nameAr.strip()
    user.name_en = payload.nameEn.strip()
    user.headline = {"ar": payload.headlineAr.strip(), "en": payload.headlineEn.strip()}
    user.bio = {"ar": payload.bioAr.strip(), "en": payload.bioEn.strip()}
    roles = set(user.roles or ["student"])
    if "instructor" not in roles:
        roles.add("instructor")
        user.became_instructor_at = datetime.now(timezone.utc)
    user.roles = sorted(roles)
    await db.commit()
    return {"isInstructor": True, "roles": user.roles}


class ProfileIn(BaseModel):
    nameAr: str | None = None
    nameEn: str | None = None
    headlineAr: str | None = None
    headlineEn: str | None = None
    bioAr: str | None = None
    bioEn: str | None = None


@router.patch("/profile")
async def update_profile(payload: ProfileIn, db: DB, user: CurrentUser):
    _require_instructor(user)
    if payload.nameAr is not None:
        user.name_ar = payload.nameAr.strip()
    if payload.nameEn is not None:
        user.name_en = payload.nameEn.strip()
    headline = dict(user.headline or {})
    bio = dict(user.bio or {})
    if payload.headlineAr is not None:
        headline["ar"] = payload.headlineAr.strip()
    if payload.headlineEn is not None:
        headline["en"] = payload.headlineEn.strip()
    if payload.bioAr is not None:
        bio["ar"] = payload.bioAr.strip()
    if payload.bioEn is not None:
        bio["en"] = payload.bioEn.strip()
    user.headline = headline
    user.bio = bio
    await db.commit()
    return {"ok": True}


# ------------------------------------------------------------------- overview


@router.get("/overview")
async def overview(db: DB, user: CurrentUser, locale: str = "ar"):
    _require_instructor(user)

    result = await db.execute(select(Course).where(Course.instructor_id == user.id))
    courses = list(result.scalars())
    ids = [c.id for c in courses]

    students = 0
    completions = 0
    if ids:
        enrolled = await db.execute(
            select(
                func.count(Enrollment.id),
                func.count(Enrollment.completed_at),
            ).where(Enrollment.course_id.in_(ids))
        )
        students, completions = enrolled.one()

    rated = [c for c in courses if c.rating_count]
    rating = (
        sum(c.rating_avg * c.rating_count for c in rated) / sum(c.rating_count for c in rated)
        if rated
        else 0
    )

    # Revenue is modelled, not measured: orders are not wired to the author yet, so
    # showing a number here would be a fabricated figure on a finance platform.
    return {
        "coursesTotal": len(courses),
        "coursesPublished": sum(1 for c in courses if c.status == "published"),
        "coursesDraft": sum(1 for c in courses if c.status == "draft"),
        "studentsTotal": students,
        "completionsTotal": completions,
        "ratingAvg": round(rating, 2),
        "ratingCount": sum(c.rating_count for c in courses),
    }


def _course_row(course: Course, lessons: int, locale: str) -> dict:
    return {
        "id": course.id,
        "slug": course.slug,
        "title": pick(course.title, locale) or course.slug,
        "coverUrl": course.cover_url,
        "status": course.status,
        "isFree": course.is_free,
        "price": Money(course.price_minor, course.currency).to_api(locale),
        "studentsCount": course.students_count,
        "ratingAvg": round(course.rating_avg, 1),
        "ratingCount": course.rating_count,
        "lessonsCount": lessons,
        "availableLocales": course.available_locales,
        "updatedAt": course.updated_at.isoformat() if course.updated_at else None,
    }


@router.get("/courses")
async def my_courses(db: DB, user: CurrentUser, locale: str = "ar"):
    _require_instructor(user)
    result = await db.execute(
        select(Course).where(Course.instructor_id == user.id).order_by(Course.created_at.desc())
    )
    courses = list(result.scalars())

    counts: dict[str, int] = {}
    if courses:
        rows = await db.execute(
            select(Lesson.course_id, func.count(Lesson.id))
            .where(Lesson.course_id.in_([c.id for c in courses]))
            .group_by(Lesson.course_id)
        )
        counts = dict(rows.all())

    return {"data": [_course_row(c, counts.get(c.id, 0), locale) for c in courses]}


# --------------------------------------------------------------------- course


class CourseIn(BaseModel):
    titleAr: str = Field(min_length=3, max_length=200)
    titleEn: str = Field(min_length=3, max_length=200)
    subtitleAr: str = ""
    subtitleEn: str = ""
    categorySlug: str | None = None
    level: str = "beginner"
    priceMinor: int = 0
    isFree: bool = False


def _slugify(value: str) -> str:
    import re

    base = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return base or "course"


@router.post("/courses")
async def create_course(payload: CourseIn, db: DB, user: CurrentUser, locale: str = "ar"):
    _require_instructor(user)

    base = _slugify(payload.titleEn or payload.titleAr)
    slug = base
    for n in range(2, 60):
        existing = await db.execute(select(Course.id).where(Course.slug == slug))
        if existing.scalar_one_or_none() is None:
            break
        slug = f"{base}-{n}"

    category_id = None
    if payload.categorySlug:
        row = await db.execute(select(Category).where(Category.slug == payload.categorySlug))
        category = row.scalar_one_or_none()
        category_id = category.id if category else None

    course = Course(
        slug=slug,
        title={"ar": payload.titleAr, "en": payload.titleEn},
        subtitle={"ar": payload.subtitleAr, "en": payload.subtitleEn},
        description={"ar": payload.subtitleAr, "en": payload.subtitleEn},
        outcomes={"ar": [], "en": []},
        requirements={"ar": [], "en": []},
        level=payload.level,
        available_locales=["ar"],
        category_id=category_id,
        instructor_id=user.id,
        status="draft",
        is_free=payload.isFree,
        price_minor=0 if payload.isFree else payload.priceMinor,
        currency="OMR",
    )
    db.add(course)
    await db.flush()
    db.add(Module(course_id=course.id, title={"ar": "الوحدة الأولى", "en": "Module one"}, position=1))
    await db.commit()
    return {"slug": course.slug, "status": course.status}


class CoursePatch(BaseModel):
    titleAr: str | None = None
    titleEn: str | None = None
    subtitleAr: str | None = None
    subtitleEn: str | None = None
    descriptionAr: str | None = None
    descriptionEn: str | None = None
    outcomesAr: list[str] | None = None
    outcomesEn: list[str] | None = None
    requirementsAr: list[str] | None = None
    requirementsEn: list[str] | None = None
    level: str | None = None
    categorySlug: str | None = None
    priceMinor: int | None = None
    isFree: bool | None = None
    coverUrl: str | None = None


@router.patch("/courses/{slug}")
async def update_course(slug: str, payload: CoursePatch, db: DB, user: CurrentUser):
    course = await _owned(db, user, slug)

    def merge(current: dict | None, ar: str | list | None, en: str | list | None):
        out = dict(current or {})
        if ar is not None:
            out["ar"] = ar
        if en is not None:
            out["en"] = en
        return out

    course.title = merge(course.title, payload.titleAr, payload.titleEn)
    course.subtitle = merge(course.subtitle, payload.subtitleAr, payload.subtitleEn)
    course.description = merge(course.description, payload.descriptionAr, payload.descriptionEn)
    course.outcomes = merge(course.outcomes, payload.outcomesAr, payload.outcomesEn)
    course.requirements = merge(
        course.requirements, payload.requirementsAr, payload.requirementsEn
    )
    if payload.level:
        course.level = payload.level
    if payload.coverUrl is not None:
        course.cover_url = payload.coverUrl
    if payload.isFree is not None:
        course.is_free = payload.isFree
        if payload.isFree:
            course.price_minor = 0
    if payload.priceMinor is not None and not course.is_free:
        # Prices arrive as whole baisa. Anything fractional means the client did
        # float arithmetic somewhere upstream.
        if payload.priceMinor < 0:
            raise AppError("course.price_invalid", 422, "Price cannot be negative")
        course.price_minor = payload.priceMinor
    if payload.categorySlug:
        row = await db.execute(select(Category).where(Category.slug == payload.categorySlug))
        category = row.scalar_one_or_none()
        course.category_id = category.id if category else None

    await db.commit()
    return {"ok": True}


@router.get("/courses/{slug}")
async def get_course(slug: str, db: DB, user: CurrentUser):
    course = await _owned(db, user, slug)

    modules_result = await db.execute(
        select(Module).where(Module.course_id == course.id).order_by(Module.position)
    )
    lessons_result = await db.execute(
        select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.position)
    )
    lessons = list(lessons_result.scalars())

    versions_result = await db.execute(
        select(LessonVersion).where(
            LessonVersion.lesson_id.in_([x.id for x in lessons] or [""])
        )
    )
    by_lesson: dict[str, set[str]] = {}
    for version in versions_result.scalars():
        if version.content:
            by_lesson.setdefault(version.lesson_id, set()).add(version.locale)

    category_slug = None
    if course.category_id:
        row = await db.execute(select(Category).where(Category.id == course.category_id))
        category = row.scalar_one_or_none()
        category_slug = category.slug if category else None

    return {
        "slug": course.slug,
        "status": course.status,
        "title": course.title,
        "subtitle": course.subtitle,
        "description": course.description,
        "outcomes": course.outcomes or {"ar": [], "en": []},
        "requirements": course.requirements or {"ar": [], "en": []},
        "level": course.level,
        "categorySlug": category_slug,
        "coverUrl": course.cover_url,
        "isFree": course.is_free,
        "priceMinor": course.price_minor,
        "currency": course.currency,
        "availableLocales": course.available_locales,
        "studentsCount": course.students_count,
        "modules": [
            {
                "id": module.id,
                "title": module.title,
                "position": module.position,
                "lessons": [
                    {
                        "id": lesson.id,
                        "slug": lesson.slug,
                        "title": lesson.title,
                        "type": lesson.type,
                        "position": lesson.position,
                        "durationMinutes": lesson.duration_minutes,
                        "isPreview": lesson.is_preview,
                        "status": lesson.status,
                        "filledLocales": sorted(by_lesson.get(lesson.id, set())),
                    }
                    for lesson in lessons
                    if lesson.module_id == module.id
                ],
            }
            for module in modules_result.scalars()
        ],
    }


@router.post("/courses/{slug}/publish")
async def publish(slug: str, db: DB, user: CurrentUser):
    """Publishing is the real gate, so it is the only place that validates.

    A course with no lesson content is the most common thing an author tries to
    publish, and the failure has to name what is missing rather than say "invalid".
    """
    course = await _owned(db, user, slug)

    lessons_result = await db.execute(select(Lesson).where(Lesson.course_id == course.id))
    lessons = list(lessons_result.scalars())

    problems: list[str] = []
    if not (course.title or {}).get("ar"):
        problems.append("title_ar")
    if not (course.subtitle or {}).get("ar"):
        problems.append("subtitle_ar")
    if not lessons:
        problems.append("no_lessons")

    filled = set()
    if lessons:
        versions = await db.execute(
            select(LessonVersion).where(LessonVersion.lesson_id.in_([x.id for x in lessons]))
        )
        for version in versions.scalars():
            if version.content:
                filled.add(version.lesson_id)
    empty = [x.slug for x in lessons if x.id not in filled]
    if empty:
        problems.append("empty_lessons")

    if problems:
        raise AppError(
            "course.not_publishable",
            422,
            "Course is not ready to publish",
            problems=problems,
            emptyLessons=empty[:10],
        )

    locales = set()
    versions = await db.execute(
        select(LessonVersion).where(LessonVersion.lesson_id.in_([x.id for x in lessons]))
    )
    for version in versions.scalars():
        if version.content:
            locales.add(version.locale)

    course.status = "published"
    course.available_locales = sorted(locales) or ["ar"]
    course.duration_minutes = sum(x.duration_minutes for x in lessons)
    course.published_at = datetime.now(timezone.utc)
    await db.commit()
    return {"status": course.status, "availableLocales": course.available_locales}


@router.post("/courses/{slug}/unpublish")
async def unpublish(slug: str, db: DB, user: CurrentUser):
    course = await _owned(db, user, slug)
    course.status = "draft"
    await db.commit()
    return {"status": course.status}


# -------------------------------------------------------------------- modules


class ModuleIn(BaseModel):
    titleAr: str = Field(min_length=1, max_length=200)
    titleEn: str = ""


@router.post("/courses/{slug}/modules")
async def add_module(slug: str, payload: ModuleIn, db: DB, user: CurrentUser):
    course = await _owned(db, user, slug)
    last = await db.execute(
        select(func.coalesce(func.max(Module.position), 0)).where(Module.course_id == course.id)
    )
    module = Module(
        course_id=course.id,
        title={"ar": payload.titleAr, "en": payload.titleEn or payload.titleAr},
        position=last.scalar_one() + 1,
    )
    db.add(module)
    await db.commit()
    return {"id": module.id}


@router.delete("/modules/{module_id}")
async def delete_module(module_id: str, db: DB, user: CurrentUser):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise NotFound("Module not found")
    course = await _owned(db, user, (await _course_slug(db, module.course_id)))
    lessons = await db.execute(select(func.count(Lesson.id)).where(Lesson.module_id == module_id))
    if lessons.scalar_one():
        raise AppError("module.not_empty", 409, "Move or delete its lessons first")
    await db.delete(module)
    await db.commit()
    return {"ok": True, "courseSlug": course.slug}


async def _course_slug(db: DB, course_id: str) -> str:
    row = await db.execute(select(Course.slug).where(Course.id == course_id))
    slug = row.scalar_one_or_none()
    if not slug:
        raise NotFound("Course not found")
    return slug


# -------------------------------------------------------------------- lessons


class LessonIn(BaseModel):
    titleAr: str = Field(min_length=1, max_length=200)
    titleEn: str = ""
    type: str = "content"
    durationMinutes: int = 10


@router.post("/modules/{module_id}/lessons")
async def add_lesson(module_id: str, payload: LessonIn, db: DB, user: CurrentUser):
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one_or_none()
    if not module:
        raise NotFound("Module not found")
    course = await _owned(db, user, await _course_slug(db, module.course_id))

    last = await db.execute(
        select(func.coalesce(func.max(Lesson.position), 0)).where(Lesson.course_id == course.id)
    )
    position = last.scalar_one() + 1

    base = _slugify(payload.titleEn or payload.titleAr) or f"lesson-{position}"
    slug = base
    for n in range(2, 60):
        exists = await db.execute(
            select(Lesson.id).where(Lesson.course_id == course.id, Lesson.slug == slug)
        )
        if exists.scalar_one_or_none() is None:
            break
        slug = f"{base}-{n}"

    lesson = Lesson(
        module_id=module.id,
        course_id=course.id,
        slug=slug,
        title={"ar": payload.titleAr, "en": payload.titleEn or payload.titleAr},
        type=payload.type,
        position=position,
        duration_minutes=payload.durationMinutes,
        # The first lesson of a course is the preview by default: an author who
        # never thinks about it still ends up with something a buyer can look at.
        is_preview=position == 1,
        status="published",
    )
    db.add(lesson)
    await db.commit()
    return {"id": lesson.id, "slug": lesson.slug}


class LessonPatch(BaseModel):
    titleAr: str | None = None
    titleEn: str | None = None
    durationMinutes: int | None = None
    isPreview: bool | None = None
    type: str | None = None
    # Empty string detaches, which is how an author removes a video without
    # deleting the lesson around it.
    mediaAssetId: str | None = None


@router.patch("/lessons/{lesson_id}")
async def update_lesson(lesson_id: str, payload: LessonPatch, db: DB, user: CurrentUser):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")
    await _owned(db, user, await _course_slug(db, lesson.course_id))

    title = dict(lesson.title or {})
    if payload.titleAr is not None:
        title["ar"] = payload.titleAr
    if payload.titleEn is not None:
        title["en"] = payload.titleEn
    lesson.title = title
    if payload.durationMinutes is not None:
        lesson.duration_minutes = max(1, payload.durationMinutes)
    if payload.isPreview is not None:
        lesson.is_preview = payload.isPreview
    if payload.type:
        lesson.type = payload.type

    if payload.mediaAssetId is not None:
        if payload.mediaAssetId == "":
            lesson.media_asset_id = None
            if lesson.type == "video":
                lesson.type = "content"
        else:
            asset = (
                await db.execute(
                    select(MediaAsset).where(MediaAsset.id == payload.mediaAssetId)
                )
            ).scalar_one_or_none()
            if asset is None or asset.kind != "video":
                raise AppError("media.not_a_video", 422, "That asset is not a video")
            lesson.media_asset_id = asset.id
            lesson.type = "video"
            if not payload.durationMinutes and asset.duration_seconds:
                lesson.duration_minutes = max(1, round(asset.duration_seconds / 60))

    await db.commit()
    return {"ok": True}


@router.delete("/lessons/{lesson_id}")
async def delete_lesson(lesson_id: str, db: DB, user: CurrentUser):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")
    await _owned(db, user, await _course_slug(db, lesson.course_id))
    await db.delete(lesson)
    await db.commit()
    return {"ok": True}


@router.get("/lessons/{lesson_id}/content")
async def get_lesson_content(lesson_id: str, db: DB, user: CurrentUser, locale: str = "ar"):
    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")
    await _owned(db, user, await _course_slug(db, lesson.course_id))

    versions = await db.execute(
        select(LessonVersion).where(LessonVersion.lesson_id == lesson_id)
    )
    blocks: dict[str, list] = {}
    for version in versions.scalars():
        blocks[version.locale] = version.content or []

    video = None
    if lesson.media_asset_id:
        asset = (
            await db.execute(select(MediaAsset).where(MediaAsset.id == lesson.media_asset_id))
        ).scalar_one_or_none()
        if asset:
            # No filename: MediaAsset has no such column, and adding one now
            # would need a migration against a database that is already live.
            video = {
                "assetId": asset.id,
                "status": asset.status,
                "durationSeconds": asset.duration_seconds,
                "sizeBytes": asset.size_bytes,
            }

    return {
        "lessonId": lesson.id,
        "title": lesson.title,
        "durationMinutes": lesson.duration_minutes,
        "isPreview": lesson.is_preview,
        "type": lesson.type,
        "video": video,
        "blocks": {loc: blocks.get(loc, []) for loc in LOCALES},
    }


class ContentIn(BaseModel):
    blocks: list[dict]


@router.put("/lessons/{lesson_id}/content")
async def save_lesson_content(
    lesson_id: str, payload: ContentIn, db: DB, user: CurrentUser, locale: str = "ar"
):
    if locale not in LOCALES:
        raise AppError("locale.unsupported", 422, "Unsupported locale")

    result = await db.execute(select(Lesson).where(Lesson.id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise NotFound("Lesson not found")
    await _owned(db, user, await _course_slug(db, lesson.course_id))

    existing = await db.execute(
        select(LessonVersion).where(
            LessonVersion.lesson_id == lesson_id, LessonVersion.locale == locale
        )
    )
    version = existing.scalar_one_or_none()
    if version:
        version.content = payload.blocks
        version.status = "published"
    else:
        db.add(
            LessonVersion(
                lesson_id=lesson_id,
                locale=locale,
                content=payload.blocks,
                status="published",
                translation_status="done",
            )
        )
    await db.commit()
    return {"ok": True, "blocks": len(payload.blocks)}


# ------------------------------------------------------------------- students


@router.get("/courses/{slug}/students")
async def course_students(slug: str, db: DB, user: CurrentUser, locale: str = "ar"):
    course = await _owned(db, user, slug)

    rows = await db.execute(
        select(Enrollment, User)
        .join(User, User.id == Enrollment.user_id)
        .where(Enrollment.course_id == course.id)
        .order_by(Enrollment.created_at.desc())
        .limit(100)
    )
    pairs = rows.all()

    lessons_total = await db.execute(
        select(func.count(Lesson.id)).where(Lesson.course_id == course.id)
    )
    total = lessons_total.scalar_one() or 0

    done_rows = await db.execute(
        select(LessonProgress.user_id, func.count(LessonProgress.id))
        .where(
            LessonProgress.course_id == course.id,
            LessonProgress.status == "completed",
        )
        .group_by(LessonProgress.user_id)
    )
    done = dict(done_rows.all())

    reviews = await db.execute(select(Review).where(Review.course_id == course.id))
    review_by_user = {r.user_id: r for r in reviews.scalars()}

    return {
        "lessonsTotal": total,
        "data": [
            {
                "userId": u.id,
                "name": u.display_name(locale) or u.email.split("@")[0],
                "email": u.email,
                "avatarUrl": u.avatar_url,
                "status": e.status,
                "source": e.source,
                "lessonsCompleted": done.get(u.id, 0),
                "progressPercent": round(done.get(u.id, 0) / total * 100) if total else 0,
                "enrolledAt": e.created_at.isoformat(),
                "rating": review_by_user[u.id].rating if u.id in review_by_user else None,
            }
            for e, u in pairs
        ],
    }
