"""Points, levels and achievements.

The rules live here alone. Handlers report what happened — a lesson finished, a
quiz passed — and never decide what it is worth, so the numbers cannot drift
between the places that award them.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import (
    Certificate,
    Lesson,
    LessonProgress,
    QuizAttempt,
    UserAchievement,
    XpEvent,
)

# Streaks are counted in the student's day, not the server's. A UTC boundary
# would end the Gulf day at four in the morning and break a streak mid-evening.
PLATFORM_TZ = ZoneInfo("Asia/Muscat")

AWARDS: dict[str, int] = {
    "lesson": 10,
    "quiz": 25,
    "quiz_perfect": 15,
    "course": 150,
    "certificate": 50,
}

# Cumulative points required to reach each level. The gaps widen so that early
# levels arrive quickly enough to mean anything and later ones stay worth having.
LEVELS: list[tuple[int, str, str]] = [
    (0, "مبتدئ", "Novice"),
    (100, "متعلّم", "Learner"),
    (260, "مثابر", "Persistent"),
    (500, "متمكّن", "Capable"),
    (850, "متقدّم", "Advanced"),
    (1350, "محترف", "Professional"),
    (2000, "خبير", "Expert"),
    (2900, "متمرّس", "Seasoned"),
    (4100, "مرجع", "Authority"),
    (5800, "أستاذ", "Master"),
]

# code -> (icon, target metric, target value, ar name, en name, ar hint, en hint)
ACHIEVEMENTS: list[dict] = [
    {"code": "first_lesson", "icon": "footprints", "metric": "lessonsCompleted", "target": 1,
     "ar": "الخطوة الأولى", "en": "First step",
     "arHint": "أنهِ درسًا واحدًا", "enHint": "Finish one lesson"},
    {"code": "ten_lessons", "icon": "stack", "metric": "lessonsCompleted", "target": 10,
     "ar": "عشرة دروس", "en": "Ten lessons",
     "arHint": "أنهِ عشرة دروس", "enHint": "Finish ten lessons"},
    {"code": "fifty_lessons", "icon": "mountains", "metric": "lessonsCompleted", "target": 50,
     "ar": "خمسون درسًا", "en": "Fifty lessons",
     "arHint": "أنهِ خمسين درسًا", "enHint": "Finish fifty lessons"},
    {"code": "first_quiz", "icon": "check", "metric": "quizzesPassed", "target": 1,
     "ar": "أول اختبار", "en": "First quiz",
     "arHint": "اجتز اختبارًا", "enHint": "Pass a quiz"},
    {"code": "perfect_quiz", "icon": "target", "metric": "perfectQuizzes", "target": 1,
     "ar": "إجابة كاملة", "en": "Full marks",
     "arHint": "اجتز اختبارًا بدرجة كاملة", "enHint": "Pass a quiz with every answer right"},
    {"code": "five_perfect", "icon": "crosshair", "metric": "perfectQuizzes", "target": 5,
     "ar": "خمس مرات كاملة", "en": "Five perfect",
     "arHint": "خمسة اختبارات بدرجة كاملة", "enHint": "Five quizzes with full marks"},
    {"code": "first_course", "icon": "certificate", "metric": "coursesCompleted", "target": 1,
     "ar": "دورة مكتملة", "en": "Course finished",
     "arHint": "أكمل دورة كاملة", "enHint": "Finish a whole course"},
    {"code": "three_courses", "icon": "books", "metric": "coursesCompleted", "target": 3,
     "ar": "ثلاث دورات", "en": "Three courses",
     "arHint": "أكمل ثلاث دورات", "enHint": "Finish three courses"},
    {"code": "streak_3", "icon": "flame", "metric": "streakDays", "target": 3,
     "ar": "ثلاثة أيام متتالية", "en": "Three days running",
     "arHint": "تعلّم ثلاثة أيام متتالية", "enHint": "Learn three days in a row"},
    {"code": "streak_7", "icon": "flame", "metric": "streakDays", "target": 7,
     "ar": "أسبوع كامل", "en": "A full week",
     "arHint": "تعلّم سبعة أيام متتالية", "enHint": "Learn seven days in a row"},
    {"code": "streak_30", "icon": "flame", "metric": "streakDays", "target": 30,
     "ar": "شهر بلا انقطاع", "en": "A month unbroken",
     "arHint": "تعلّم ثلاثين يومًا متتاليًا", "enHint": "Learn thirty days in a row"},
    {"code": "hour", "icon": "clock", "metric": "minutesLearned", "target": 60,
     "ar": "ساعة تعلّم", "en": "An hour in",
     "arHint": "اقضِ ساعة في الدروس", "enHint": "Spend an hour in lessons"},
    {"code": "ten_hours", "icon": "hourglass", "metric": "minutesLearned", "target": 600,
     "ar": "عشر ساعات", "en": "Ten hours",
     "arHint": "اقضِ عشر ساعات في الدروس", "enHint": "Spend ten hours in lessons"},
]


def level_for(total_xp: int) -> dict:
    """Level, plus how far into it the student is.

    Returned together because a bare number says nothing: the bar needs both
    ends of the current level, and computing them twice invites them to disagree.
    """
    index = 0
    for i, (threshold, _, _) in enumerate(LEVELS):
        if total_xp >= threshold:
            index = i
    floor_xp, ar, en = LEVELS[index]
    is_last = index == len(LEVELS) - 1
    ceiling = None if is_last else LEVELS[index + 1][0]
    return {
        "level": index + 1,
        "titleAr": ar,
        "titleEn": en,
        "levelFloor": floor_xp,
        "levelCeiling": ceiling,
        "intoLevel": total_xp - floor_xp,
        "levelSpan": None if ceiling is None else ceiling - floor_xp,
    }


async def award(db: AsyncSession, user_id: str, kind: str, ref_id: str) -> int:
    """Record points once. Repeating the same event is a no-op, not a top-up."""
    amount = AWARDS.get(kind, 0)
    if not amount:
        return 0
    try:
        # The savepoint keeps a duplicate from poisoning the surrounding
        # transaction, which still has a lesson or a certificate to commit.
        async with db.begin_nested():
            db.add(XpEvent(user_id=user_id, kind=kind, ref_id=ref_id, amount=amount))
    except IntegrityError:
        return 0
    return amount


def _streak(days: set[date], today: date) -> tuple[int, int]:
    """Current and longest run of consecutive active days.

    A day that has not ended yet cannot break anything, so a streak that stops
    yesterday is still alive until midnight passes.
    """
    if not days:
        return 0, 0

    ordered = sorted(days)
    longest = run = 1
    for previous, current in zip(ordered, ordered[1:]):
        run = run + 1 if current - previous == timedelta(days=1) else 1
        longest = max(longest, run)

    current_run = 0
    cursor = today if today in days else today - timedelta(days=1)
    while cursor in days:
        current_run += 1
        cursor -= timedelta(days=1)
    return current_run, longest


async def stats(db: AsyncSession, user_id: str, locale: str = "ar") -> dict:
    events = (
        await db.execute(select(XpEvent.amount, XpEvent.created_at).where(XpEvent.user_id == user_id))
    ).all()
    total_xp = sum(amount for amount, _ in events)

    active_days = {
        moment.astimezone(PLATFORM_TZ).date() for _, moment in events if moment is not None
    }
    today = datetime.now(PLATFORM_TZ).date()
    streak_days, longest_streak = _streak(active_days, today)

    lessons_completed = (
        await db.execute(
            select(func.count(LessonProgress.id)).where(
                LessonProgress.user_id == user_id, LessonProgress.status == "completed"
            )
        )
    ).scalar_one()

    # Minutes of material finished, not seconds of video played. Reading a text
    # lesson produces no watch time, and a student who finished twelve lessons
    # being told they have learned for zero minutes reads as a broken counter.
    minutes_learned = (
        await db.execute(
            select(func.coalesce(func.sum(Lesson.duration_minutes), 0))
            .select_from(LessonProgress)
            .join(Lesson, Lesson.id == LessonProgress.lesson_id)
            .where(
                LessonProgress.user_id == user_id, LessonProgress.status == "completed"
            )
        )
    ).scalar_one()

    quizzes_passed = (
        await db.execute(
            select(func.count(func.distinct(QuizAttempt.quiz_id))).where(
                QuizAttempt.user_id == user_id, QuizAttempt.passed.is_(True)
            )
        )
    ).scalar_one()

    perfect_quizzes = (
        await db.execute(
            select(func.count(func.distinct(QuizAttempt.quiz_id))).where(
                QuizAttempt.user_id == user_id, QuizAttempt.score_percent >= 100
            )
        )
    ).scalar_one()

    courses_completed = (
        await db.execute(
            select(func.count(Certificate.id)).where(Certificate.user_id == user_id)
        )
    ).scalar_one()

    metrics = {
        "totalXp": int(total_xp),
        "lessonsCompleted": int(lessons_completed),
        "minutesLearned": int(minutes_learned),
        "quizzesPassed": int(quizzes_passed),
        "perfectQuizzes": int(perfect_quizzes),
        "coursesCompleted": int(courses_completed),
        "streakDays": streak_days,
        "longestStreak": longest_streak,
        "activeDays": len(active_days),
    }
    return metrics | level_for(int(total_xp))


async def sync_achievements(db: AsyncSession, user_id: str, metrics: dict) -> list[str]:
    """Unlock whatever the numbers now justify. Returns the newly earned codes.

    Achievements are derived, never incremented, so one that was missed while a
    handler was broken still appears the next time the student is looked at.
    """
    already = set(
        (
            await db.execute(
                select(UserAchievement.code).where(UserAchievement.user_id == user_id)
            )
        ).scalars()
    )
    earned = [
        item["code"]
        for item in ACHIEVEMENTS
        if item["code"] not in already and metrics.get(item["metric"], 0) >= item["target"]
    ]
    unlocked: list[str] = []
    for code in earned:
        try:
            async with db.begin_nested():
                db.add(UserAchievement(user_id=user_id, code=code))
        except IntegrityError:
            continue
        unlocked.append(code)
    return unlocked


async def profile(db: AsyncSession, user_id: str, locale: str = "ar") -> dict:
    """Everything the progress screen shows, in one round of queries."""
    metrics = await stats(db, user_id, locale)
    await sync_achievements(db, user_id, metrics)

    unlocked = {
        code: moment
        for code, moment in (
            await db.execute(
                select(UserAchievement.code, UserAchievement.unlocked_at).where(
                    UserAchievement.user_id == user_id
                )
            )
        ).all()
    }

    achievements = [
        {
            "code": item["code"],
            "icon": item["icon"],
            "name": item["ar"] if locale == "ar" else item["en"],
            "hint": item["arHint"] if locale == "ar" else item["enHint"],
            "target": item["target"],
            "progress": min(metrics.get(item["metric"], 0), item["target"]),
            "unlockedAt": unlocked[item["code"]].isoformat() if item["code"] in unlocked else None,
        }
        for item in ACHIEVEMENTS
    ]
    achievements.sort(key=lambda a: (a["unlockedAt"] is None, -a["progress"] / a["target"]))

    return metrics | {
        "title": metrics["titleAr"] if locale == "ar" else metrics["titleEn"],
        "achievements": achievements,
        "achievementsUnlocked": len(unlocked),
        "achievementsTotal": len(ACHIEVEMENTS),
    }
