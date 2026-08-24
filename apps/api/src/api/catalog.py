"""Public catalogue.

Every response carries the locale it was actually resolved with. When the
requested locale is missing the client is told, so it can show "this course is
currently only in English" instead of silently swapping languages.
"""

from fastapi import APIRouter, Query
from sqlalchemy import or_, select

from ..core.access import has_course_access
from ..core.deps import DB, Locale, OptionalUser
from ..core.errors import NotFound
from ..core.i18n import ar_normalize, pick, resolve
from ..core.money import Money
from ..models import Category, Course, Enrollment, Lesson, Module, Review

router = APIRouter(prefix="/catalog", tags=["catalog"])


def course_card(course: Course, locale: str) -> dict:
    title, resolved, fallback = resolve(course.title, locale)
    return {
        "id": course.id,
        "slug": course.slug,
        "title": title,
        "subtitle": pick(course.subtitle, locale),
        "coverUrl": course.cover_url,
        "level": course.level,
        "durationMinutes": course.duration_minutes,
        "availableLocales": course.available_locales,
        "isFree": course.is_free,
        "price": Money(course.price_minor, course.currency).to_api(locale),
        "ratingAvg": round(course.rating_avg, 1),
        "ratingCount": course.rating_count,
        "studentsCount": course.students_count,
        "category": pick(course.category.title, locale) if course.category else None,
        "instructor": {
            "name": course.instructor.display_name(locale),
            "avatarUrl": course.instructor.avatar_url,
        }
        if course.instructor
        else None,
        "meta": {"locale": locale, "resolvedLocale": resolved, "isFallback": fallback},
    }


@router.get("/categories")
async def list_categories(db: DB, locale: Locale):
    result = await db.execute(select(Category).order_by(Category.position))
    return [
        {"id": c.id, "slug": c.slug, "title": pick(c.title, locale)}
        for c in result.scalars()
    ]


@router.get("/courses")
async def list_courses(
    db: DB,
    locale: Locale,
    q: str | None = None,
    category: str | None = None,
    level: str | None = None,
    limit: int = Query(24, le=48),
):
    stmt = select(Course).where(Course.status == "published")
    if category:
        stmt = stmt.join(Category).where(Category.slug == category)
    if level:
        stmt = stmt.where(Course.level == level)

    result = await db.execute(stmt.limit(limit))
    courses = list(result.scalars())

    if q:
        # Arabic normalisation: users type without diacritics and with any alef
        # variant. Comparing raw strings misses most real queries.
        needle = ar_normalize(q)
        courses = [
            c
            for c in courses
            if needle in ar_normalize(" ".join(filter(None, [
                *(c.title or {}).values(), *(c.subtitle or {}).values()
            ])))
        ]

    return {"data": [course_card(c, locale) for c in courses], "total": len(courses)}


@router.get("/courses/{slug}")
async def get_course(slug: str, db: DB, locale: Locale, user: OptionalUser):
    result = await db.execute(select(Course).where(Course.slug == slug))
    course = result.scalar_one_or_none()
    if not course or course.status != "published":
        raise NotFound("Course not found")

    modules_result = await db.execute(
        select(Module).where(Module.course_id == course.id).order_by(Module.position)
    )
    modules = list(modules_result.scalars())

    lessons_result = await db.execute(
        select(Lesson).where(Lesson.course_id == course.id).order_by(Lesson.position)
    )
    lessons = list(lessons_result.scalars())

    reviews_result = await db.execute(
        select(Review).where(Review.course_id == course.id).limit(6)
    )

    enrolled = False
    if user:
        e = await db.execute(
            select(Enrollment).where(
                Enrollment.user_id == user.id,
                Enrollment.course_id == course.id,
                Enrollment.status.in_(("active", "completed")),
            )
        )
        enrolled = e.scalar_one_or_none() is not None

    unlocked = await has_course_access(db, user, course)

    curriculum = []
    for module in modules:
        module_lessons = [x for x in lessons if x.module_id == module.id]
        curriculum.append(
            {
                "id": module.id,
                "title": pick(module.title, locale),
                "lessons": [
                    {
                        "id": lesson.id,
                        "slug": lesson.slug,
                        "title": pick(lesson.title, locale),
                        "type": lesson.type,
                        "durationMinutes": lesson.duration_minutes,
                        "isPreview": lesson.is_preview,
                        # The curriculum shows titles to everyone. It never
                        # exposes lesson content: that is what the paywall protects.
                        "locked": not (unlocked or lesson.is_preview),
                    }
                    for lesson in module_lessons
                ],
            }
        )

    title, resolved, fallback = resolve(course.title, locale)
    return {
        **course_card(course, locale),
        "description": pick(course.description, locale),
        "outcomes": (course.outcomes or {}).get(locale)
        or (course.outcomes or {}).get(course.default_locale)
        or [],
        "requirements": (course.requirements or {}).get(locale)
        or (course.requirements or {}).get(course.default_locale)
        or [],
        "curriculum": curriculum,
        "lessonsCount": len(lessons),
        "isEnrolled": enrolled,
        "reviews": [
            {
                "id": r.id,
                "rating": r.rating,
                "content": r.content,
                "author": r.user.display_name(locale) if r.user else "",
                "avatarUrl": r.user.avatar_url if r.user else None,
            }
            for r in reviews_result.scalars()
        ],
        "meta": {"locale": locale, "resolvedLocale": resolved, "isFallback": fallback},
    }
