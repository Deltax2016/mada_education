"""Idempotent catalogue loading.

Separate from the seed on purpose. The seed drops every table first, which is
right for development and unthinkable in production, so a deployment needs a
loader that only ever adds what is missing.

Nothing here updates or deletes. A course an author has since edited is left
exactly as it is, and running this twice changes nothing the second time.
"""

import json
import logging
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import (
    Category,
    Course,
    Lesson,
    LessonVersion,
    MediaAsset,
    Module,
    Question,
    QuestionOption,
    Quiz,
    User,
)

log = logging.getLogger("content")

CONTENT_DIR = Path(__file__).with_name("content")


def cover(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/1200/675"


def avatar(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/160/160"


def p(ar: str, en: str) -> dict:
    return {"ar": ar, "en": en}


CATEGORIES = [
    ("business", p("إدارة الأعمال", "Business")),
    ("finance", p("المالية والمحاسبة", "Finance")),
    ("technology", p("التقنية", "Technology")),
    ("marketing", p("التسويق", "Marketing")),
    ("languages", p("اللغات", "Languages")),
]

INSTRUCTORS = [
    dict(
        email="salim.alharthy@mada.example",
        name_ar="د. سالم بن ناصر الحارثي", name_en="Dr. Salim Al Harthy",
        avatar="salim-harthy-portrait",
        headline=p("محاسب قانوني، يعدّ الإقرارات الضريبية للشركات في مسقط",
                   "Chartered accountant, filing corporate tax returns in Muscat"),
    ),
    dict(
        email="muna.albalushi@mada.example",
        name_ar="منى بنت خالد البلوشي", name_en="Muna Al Balushi",
        avatar="muna-balushi-portrait",
        headline=p("تدير التسويق الرقمي لمشاريع صغيرة في الخليج",
                   "Runs digital marketing for small businesses across the Gulf"),
    ),
    dict(
        email="yousuf.alrawahi@mada.example",
        name_ar="يوسف بن حمد الرواحي", name_en="Yousuf Al Rawahi",
        avatar="yousuf-rawahi-portrait",
        headline=p("مدير مشاريع إنشائية ومدرّب في التخطيط والتسليم",
                   "Construction project manager, trains teams on planning and handover"),
    ),
]

# Catalogue facts the writer has no opinion about: shelf, price, who teaches it.
META = {
    "vat-compliance-oman": dict(category="finance", instructor=0, level="intermediate",
                                price=19_900, rating=4.7, ratings=126, students=842,
                                cover="oman-vat-accounting-desk"),
    "digital-marketing-gulf": dict(category="marketing", instructor=1, level="beginner",
                                   price=24_500, rating=4.6, ratings=89, students=1_204,
                                   cover="gulf-small-business-marketing"),
    "excel-for-finance": dict(category="finance", instructor=0, level="intermediate",
                              price=29_900, rating=4.8, ratings=213, students=1_876,
                              cover="excel-spreadsheet-finance-work"),
    "cybersecurity-essentials": dict(category="technology", instructor=2, level="beginner",
                                     price=0, rating=4.4, ratings=341, students=5_120,
                                     cover="cybersecurity-office-training"),
    "business-english-meetings": dict(category="languages", instructor=1, level="beginner",
                                      price=17_500, rating=4.5, ratings=97, students=743,
                                      cover="bilingual-office-meeting-muscat"),
    "project-management-foundations": dict(category="business", instructor=2, level="intermediate",
                                           price=34_000, rating=4.7, ratings=156, students=982,
                                           cover="project-planning-team-board"),
    "omani-labour-law-managers": dict(category="business", instructor=0, level="intermediate",
                                      price=27_500, rating=4.6, ratings=64, students=418,
                                      cover="oman-employment-contract-desk"),
    "reading-financial-statements": dict(category="finance", instructor=0, level="beginner",
                                         price=21_000, rating=4.7, ratings=118, students=1_034,
                                         cover="financial-statements-annual-report"),
    "government-tenders-oman": dict(category="business", instructor=2, level="advanced",
                                    price=39_000, rating=4.5, ratings=42, students=287,
                                    cover="tender-documents-procurement-office"),
    "customer-service-arabic": dict(category="business", instructor=1, level="beginner",
                                    price=15_500, rating=4.4, ratings=73, students=651,
                                    cover="customer-support-desk-gulf"),
}


def read_content() -> list[dict]:
    """Every course, flagship first so it leads the catalogue."""
    courses: list[dict] = []
    flagship = CONTENT_DIR / "flagship.json"
    if flagship.exists():
        courses.append(json.loads(flagship.read_text()))
    authored = CONTENT_DIR / "courses.json"
    if authored.exists():
        courses.extend(json.loads(authored.read_text()))
    return courses


async def _ensure_categories(db: AsyncSession) -> dict[str, Category]:
    existing = {c.slug: c for c in (await db.execute(select(Category))).scalars()}
    for position, (slug, title) in enumerate(CATEGORIES, start=1):
        if slug not in existing:
            category = Category(slug=slug, title=title, position=position)
            db.add(category)
            existing[slug] = category
    await db.flush()
    return existing


async def _ensure_instructors(db: AsyncSession) -> list[User]:
    people: list[User] = []
    for spec in INSTRUCTORS:
        found = (
            await db.execute(select(User).where(User.email == spec["email"]))
        ).scalar_one_or_none()
        if found is None:
            found = User(
                email=spec["email"],
                name_ar=spec["name_ar"],
                name_en=spec["name_en"],
                avatar_url=avatar(spec["avatar"]),
                headline=spec["headline"],
                roles=["instructor"],
            )
            db.add(found)
        people.append(found)
    await db.flush()
    return people


async def _build_course(db: AsyncSession, spec: dict, meta: dict, categories, instructors) -> None:
    duration = sum(
        lesson["durationMinutes"] for module in spec["modules"] for lesson in module["lessons"]
    )
    locales = {"ar"}
    for module in spec["modules"]:
        for lesson in module["lessons"]:
            if lesson.get("blocksEn"):
                locales.add("en")

    course = Course(
        slug=spec["slug"],
        title=spec["title"],
        subtitle=spec["subtitle"],
        description=spec["description"],
        outcomes=spec["outcomes"],
        requirements=spec["requirements"],
        cover_url=cover(meta["cover"]),
        level=meta["level"],
        available_locales=sorted(locales),
        duration_minutes=duration,
        category_id=categories[meta["category"]].id,
        instructor_id=instructors[meta["instructor"]].id,
        status="published",
        is_free=meta["price"] == 0,
        price_minor=meta["price"],
        currency="OMR",
        rating_avg=meta["rating"],
        rating_count=meta["ratings"],
        students_count=meta["students"],
    )
    db.add(course)
    await db.flush()

    position = 0
    quiz_lesson: Lesson | None = None
    for index, module_spec in enumerate(spec["modules"], start=1):
        module = Module(course_id=course.id, title=module_spec["title"], position=index)
        db.add(module)
        await db.flush()

        for lesson_spec in module_spec["lessons"]:
            position += 1

            media_id = None
            if lesson_spec.get("video"):
                video = lesson_spec["video"]
                asset = MediaAsset(
                    kind="video",
                    storage_key=video["src"],
                    poster_url=video.get("poster"),
                    duration_seconds=video.get("durationSeconds", 0),
                    mime_type="video/mp4",
                    status="ready",
                )
                db.add(asset)
                await db.flush()
                media_id = asset.id

            is_quiz = bool(lesson_spec.get("isQuizLesson"))
            lesson = Lesson(
                module_id=module.id,
                course_id=course.id,
                slug=lesson_spec["slug"],
                title=lesson_spec["title"],
                type="quiz" if is_quiz else ("video" if media_id else "content"),
                position=position,
                duration_minutes=lesson_spec["durationMinutes"],
                # The opening lesson is readable before buying. A catalogue where
                # nothing can be sampled converts badly, and it costs one lesson.
                is_preview=position == 1,
                media_asset_id=media_id,
                status="published",
            )
            db.add(lesson)
            await db.flush()
            if is_quiz:
                quiz_lesson = lesson

            db.add(LessonVersion(lesson_id=lesson.id, locale="ar", status="published",
                                 content=lesson_spec["blocksAr"], translation_status="done"))
            if lesson_spec.get("blocksEn"):
                db.add(LessonVersion(lesson_id=lesson.id, locale="en", status="published",
                                     content=lesson_spec["blocksEn"], translation_status="done"))

    questions = spec.get("questions") or []
    if questions:
        if quiz_lesson is None:
            quiz_lesson = Lesson(
                module_id=module.id,
                course_id=course.id,
                slug="final-quiz",
                title=p("اختبار نهاية الدورة", "End of course quiz"),
                type="quiz",
                position=position + 1,
                duration_minutes=10,
                status="published",
            )
            db.add(quiz_lesson)
            await db.flush()
            for locale, text in (
                ("ar", "أسئلة تغطي ما مررت به. النجاح من 70%، ولديك ثلاث محاولات."),
                ("en", "Questions covering what you went through. Pass mark is 70%, "
                       "and you have three attempts."),
            ):
                db.add(LessonVersion(
                    lesson_id=quiz_lesson.id, locale=locale, status="published",
                    content=[{"id": "q1", "type": "paragraph", "data": {"text": text}}],
                ))

        quiz = Quiz(
            course_id=course.id,
            lesson_id=quiz_lesson.id,
            title=spec.get("quizTitle") or p("اختبار نهاية الدورة", "End of course quiz"),
            time_limit_seconds=600,
            max_attempts=3,
            passing_score=70,
            review_policy="after_submit",
            multiple_policy="partial",
        )
        db.add(quiz)
        await db.flush()

        for index, spec_q in enumerate(questions, start=1):
            config = {}
            if spec_q["type"] == "short_text":
                config["accepted"] = spec_q.get("accepted") or []
            if spec_q["type"] == "number":
                config["target"] = spec_q.get("target", 0)
                config["tolerance"] = spec_q.get("tolerance", 0.01)
                if spec_q.get("unit"):
                    config["unit"] = spec_q["unit"]
            question = Question(
                quiz_id=quiz.id, position=index, type=spec_q["type"],
                prompt=spec_q["prompt"], explanation=spec_q["explanation"],
                points=1, config=config,
            )
            db.add(question)
            await db.flush()
            for o_index, option in enumerate(spec_q.get("options") or [], start=1):
                db.add(QuestionOption(
                    question_id=question.id, position=o_index,
                    content=option["content"], is_correct=option["isCorrect"],
                ))


async def ensure_catalogue(db: AsyncSession) -> dict:
    """Create anything missing. Never update, never delete.

    Returns what it added, so a caller can log it rather than guess.
    """
    categories = await _ensure_categories(db)
    instructors = await _ensure_instructors(db)

    have = {slug for slug in (await db.execute(select(Course.slug))).scalars()}
    added: list[str] = []
    skipped: list[str] = []

    for spec in read_content():
        slug = spec["slug"]
        meta = META.get(slug)
        if meta is None:
            log.warning("no catalogue metadata for %r, skipping", slug)
            continue
        if slug in have:
            skipped.append(slug)
            continue
        await _build_course(db, spec, meta, categories, instructors)
        added.append(slug)

    await db.commit()
    return {"added": added, "skipped": skipped}


async def load_if_empty(db: AsyncSession) -> dict | None:
    """Bootstrap a brand new deployment and stay out of the way afterwards.

    Gated on the catalogue being completely empty rather than on individual
    courses, so a catalogue someone has curated is never quietly repopulated
    with material they deleted.
    """
    count = (await db.execute(select(func.count(Course.id)))).scalar_one()
    if count:
        return None
    return await ensure_catalogue(db)
