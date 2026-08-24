"""Demo data.

Deliberately includes the cases that break naive implementations:
  - a course whose English translation is missing on one lesson (fallback path)
  - a price in OMR where the third decimal matters (19.900, not 19.90)
  - an Arabic short-answer question whose key is written with a hamza while
    students will type it without one
"""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from .core.db import Base, SessionLocal, engine
from .models import (
    Category,
    Course,
    Enrollment,
    Lesson,
    LessonVersion,
    MediaAsset,
    Module,
    Question,
    QuestionOption,
    Quiz,
    Review,
    User,
)

SAMPLE_VIDEO = (
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
)


def cover(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/1200/675"


def avatar(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/160/160"


def p(ar: str, en: str) -> dict:
    return {"ar": ar, "en": en}


async def run() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        # The catalogue is built by the same loader production uses, so the two
        # can never drift. Everything below it is demo state that only makes
        # sense in development.
        from .content_loader import ensure_catalogue

        await ensure_catalogue(db)

        instructors = list(
            (await db.execute(select(User).where(User.roles.contains("instructor")))).scalars()
        )
        vat = (
            await db.execute(select(Course).where(Course.slug == "vat-compliance-oman"))
        ).scalar_one()

        student = User(
            email="student@mada.example",
            name_ar="عائشة بنت سعيد الزدجالية",
            name_en="Aisha Al Zadjali",
            avatar_url=avatar("aisha-zadjali-portrait"),
            roles=["student"],
        )
        admin = User(
            email="admin@mada.example",
            name_ar="مدير المنصة",
            name_en="Platform Admin",
            roles=["admin", "instructor"],
        )
        db.add_all([student, admin])
        await db.flush()

        # ---------------------------------------------------------- reviews
        db.add_all([
            Review(course_id=vat.id, user_id=student.id, rating=5, locale="ar",
                   content="طبّقت الخطوات على إقرار شركتي مباشرة بعد الدرس الخامس. أول مرة أقدّم بدون مراجعة المحاسب الخارجي."),
            Review(course_id=vat.id, user_id=instructors[1].id, rating=5, locale="ar",
                   content="أفضل ما فيها أن الأمثلة برقم عماني حقيقي بثلاث خانات، لا أمثلة مترجمة من سوق آخر."),
            Review(course_id=vat.id, user_id=instructors[2].id, rating=4, locale="en",
                   content="Clear and practical. I would have liked one more worked example on partial exemption."),
        ])

        # student already owns the flagship course so the app has something to show
        db.add(Enrollment(user_id=student.id, course_id=vat.id, source="purchase", locale="ar"))

        await db.commit()
        result = await db.execute(select(Course))
        print(f"seeded {len(result.scalars().all())} courses")
        print("  sign in with a code sent to any of these addresses:")
        print("    student@mada.example   owns the VAT course")
        print("    admin@mada.example     can upload media")


if __name__ == "__main__":
    asyncio.run(run())
