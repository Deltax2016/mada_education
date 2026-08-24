"""AccessPolicy: the single source of truth for "can this user open this lesson".

Enrollment, access window, publication status, preview flag and role all meet
here and nowhere else. Duplicating any part of this check elsewhere is how paid
content leaks, so every read path calls this function.
"""

from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Course, Enrollment, Lesson, User

ALLOWED = "allowed"
NEEDS_AUTH = "needs_auth"
PAYWALL = "paywall"
EXPIRED = "expired"
NOT_PUBLISHED = "not_published"

CODES = {
    NEEDS_AUTH: "auth.unauthenticated",
    PAYWALL: "access.paywall",
    EXPIRED: "access.expired",
    NOT_PUBLISHED: "access.not_published",
}

# Anonymous visitors get the catalogue and the course pages, which is what makes
# the site findable. Lesson content, previews included, requires an account.
STATUS = {
    NEEDS_AUTH: 401,
    PAYWALL: 403,
    EXPIRED: 403,
    NOT_PUBLISHED: 403,
}


@dataclass
class AccessResult:
    verdict: str
    enrollment: Enrollment | None = None

    @property
    def allowed(self) -> bool:
        return self.verdict == ALLOWED

    @property
    def code(self) -> str:
        return CODES.get(self.verdict, "auth.forbidden")

    @property
    def status(self) -> int:
        return STATUS.get(self.verdict, 403)


async def check(
    db: AsyncSession, user: User | None, lesson: Lesson, course: Course
) -> AccessResult:
    roles = set(user.roles or []) if user else set()

    # An admin can open anything, because support work requires seeing exactly
    # what the learner sees.
    #
    # An instructor may open their OWN course, and nothing else. The role is
    # self-serve: anyone can fill in a profile and get it, so treating it as a
    # platform-wide pass would make every paid course free to anyone willing to
    # spend a minute on a form.
    can_bypass = bool(
        user
        and ("admin" in roles or ("instructor" in roles and course.instructor_id == user.id))
    )

    if lesson.status != "published" and not can_bypass:
        return AccessResult(NOT_PUBLISHED)

    if can_bypass:
        return AccessResult(ALLOWED)

    # Checked before the preview and free-course shortcuts: no lesson content is
    # readable without an account, so a scraper cannot walk the free catalogue
    # and progress always has somewhere to be recorded.
    if not user:
        return AccessResult(NEEDS_AUTH)

    if lesson.is_preview or course.is_free:
        return AccessResult(ALLOWED)

    result = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user.id, Enrollment.course_id == course.id
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment or enrollment.status not in ("active", "completed"):
        return AccessResult(PAYWALL)

    if enrollment.access_ends_at:
        ends = enrollment.access_ends_at
        if ends.tzinfo is None:
            ends = ends.replace(tzinfo=timezone.utc)
        if ends < datetime.now(timezone.utc):
            return AccessResult(EXPIRED, enrollment)

    return AccessResult(ALLOWED, enrollment)


async def has_course_access(db: AsyncSession, user: User | None, course: Course) -> bool:
    """Whether the lesson list should render as open rather than locked.

    Signing in is the first gate, so an anonymous visitor sees every lesson
    locked even on a free course.
    """
    if not user:
        return False
    roles = set(user.roles or [])
    if "admin" in roles or ("instructor" in roles and course.instructor_id == user.id):
        return True
    if course.is_free:
        return True
    result = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == course.id,
            Enrollment.status.in_(("active", "completed")),
        )
    )
    return result.scalar_one_or_none() is not None
