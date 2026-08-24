"""ORM models.

Localised short fields are JSON objects keyed by locale: {"ar": "...", "en": "..."}.
Lesson content is a row per locale instead, because blocks are large, versioned
independently, and the Arabic version ships while the English one is still being
translated.

Money is always an integer in minor units plus a currency code. OMR has three
decimals, so dividing by 100 anywhere is a bug.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .core.db import Base


def uid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# --------------------------------------------------------------------------- identity


class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(String(36), default="default")

    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    name_ar: Mapped[str | None] = mapped_column(String(160))
    name_en: Mapped[str | None] = mapped_column(String(160))
    avatar_url: Mapped[str | None] = mapped_column(String(500))

    # Author profile. Empty for learners; filled when someone starts teaching.
    headline: Mapped[dict] = mapped_column(JSON, default=dict)
    bio: Mapped[dict] = mapped_column(JSON, default=dict)
    became_instructor_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    locale: Mapped[str] = mapped_column(String(5), default="ar")
    timezone: Mapped[str] = mapped_column(String(64), default="Asia/Muscat")
    country: Mapped[str] = mapped_column(String(2), default="OM")

    roles: Mapped[list] = mapped_column(JSON, default=lambda: ["student"])
    status: Mapped[str] = mapped_column(String(20), default="active")

    def display_name(self, locale: str) -> str:
        return (self.name_ar if locale == "ar" else self.name_en) or self.name_en or self.name_ar or ""


class OtpCode(Base):
    __tablename__ = "otp_codes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    destination: Mapped[str] = mapped_column(String(255), index=True)
    purpose: Mapped[str] = mapped_column(String(32), default="login")
    channel: Mapped[str] = mapped_column(String(16), default="email")
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    refresh_token_hash: Mapped[str] = mapped_column(String(64), index=True)
    family_id: Mapped[str] = mapped_column(String(36), default=uid)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# --------------------------------------------------------------------------- catalog


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    slug: Mapped[str] = mapped_column(String(80), unique=True)
    title: Mapped[dict] = mapped_column(JSON, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)


class Course(Base, TimestampMixin):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    organization_id: Mapped[str] = mapped_column(String(36), default="default")
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)

    title: Mapped[dict] = mapped_column(JSON, default=dict)
    subtitle: Mapped[dict] = mapped_column(JSON, default=dict)
    description: Mapped[dict] = mapped_column(JSON, default=dict)
    outcomes: Mapped[dict] = mapped_column(JSON, default=dict)
    requirements: Mapped[dict] = mapped_column(JSON, default=dict)

    cover_url: Mapped[str | None] = mapped_column(String(500))
    level: Mapped[str] = mapped_column(String(20), default="beginner")
    default_locale: Mapped[str] = mapped_column(String(5), default="ar")
    available_locales: Mapped[list] = mapped_column(JSON, default=lambda: ["ar"])
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)

    category_id: Mapped[str | None] = mapped_column(ForeignKey("categories.id"))
    instructor_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"))

    status: Mapped[str] = mapped_column(String(20), default="draft")
    is_free: Mapped[bool] = mapped_column(Boolean, default=False)
    price_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="OMR")

    rating_avg: Mapped[float] = mapped_column(Float, default=0)
    rating_count: Mapped[int] = mapped_column(Integer, default=0)
    students_count: Mapped[int] = mapped_column(Integer, default=0)

    modules: Mapped[list["Module"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="Module.position"
    )
    category: Mapped["Category | None"] = relationship(lazy="selectin")
    instructor: Mapped["User | None"] = relationship(lazy="selectin")


class Module(Base):
    __tablename__ = "modules"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    title: Mapped[dict] = mapped_column(JSON, default=dict)
    position: Mapped[int] = mapped_column(Integer, default=0)

    course: Mapped["Course"] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="Lesson.position"
    )


class Lesson(Base):
    __tablename__ = "lessons"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)

    slug: Mapped[str] = mapped_column(String(120))
    title: Mapped[dict] = mapped_column(JSON, default=dict)
    type: Mapped[str] = mapped_column(String(20), default="content")
    position: Mapped[int] = mapped_column(Integer, default=0)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0)
    is_preview: Mapped[bool] = mapped_column(Boolean, default=False)
    is_required: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[str] = mapped_column(String(20), default="published")

    media_asset_id: Mapped[str | None] = mapped_column(ForeignKey("media_assets.id"))

    module: Mapped["Module"] = relationship(back_populates="lessons")
    versions: Mapped[list["LessonVersion"]] = relationship(
        back_populates="lesson", cascade="all, delete-orphan", lazy="selectin"
    )

    __table_args__ = (UniqueConstraint("course_id", "slug", name="uq_lesson_course_slug"),)


class LessonVersion(Base):
    __tablename__ = "lesson_versions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"), index=True)
    locale: Mapped[str] = mapped_column(String(5))
    version: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="published")
    content: Mapped[list] = mapped_column(JSON, default=list)
    translation_status: Mapped[str] = mapped_column(String(20), default="done")

    lesson: Mapped["Lesson"] = relationship(back_populates="versions")


# --------------------------------------------------------------------------- media


class MediaAsset(Base):
    __tablename__ = "media_assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    kind: Mapped[str] = mapped_column(String(20), default="video")
    locale: Mapped[str | None] = mapped_column(String(5))
    provider: Mapped[str] = mapped_column(String(30), default="s3")
    storage_key: Mapped[str] = mapped_column(String(500))
    poster_key: Mapped[str | None] = mapped_column(String(500))
    poster_url: Mapped[str | None] = mapped_column(String(500))
    mime_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    duration_seconds: Mapped[float] = mapped_column(Float, default=0)
    status: Mapped[str] = mapped_column(String(20), default="ready")
    subtitles: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# --------------------------------------------------------------------------- enrollment


class Enrollment(Base):
    __tablename__ = "enrollments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    source: Mapped[str] = mapped_column(String(20), default="manual")
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    access_starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    access_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(20), default="active")
    progress_percent: Mapped[float] = mapped_column(Float, default=0)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    __table_args__ = (UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),)


class LessonProgress(Base):
    __tablename__ = "lesson_progress"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")
    progress_percent: Mapped[float] = mapped_column(Float, default=0)
    last_position_seconds: Mapped[float] = mapped_column(Float, default=0)
    watched_seconds: Mapped[float] = mapped_column(Float, default=0)
    blocks_seen: Mapped[list] = mapped_column(JSON, default=list)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    __table_args__ = (UniqueConstraint("user_id", "lesson_id", name="uq_progress_user_lesson"),)


# --------------------------------------------------------------------------- quiz


class Quiz(Base):
    __tablename__ = "quizzes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id"), index=True)
    title: Mapped[dict] = mapped_column(JSON, default=dict)
    time_limit_seconds: Mapped[int | None] = mapped_column(Integer)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    passing_score: Mapped[float] = mapped_column(Float, default=70)
    shuffle_questions: Mapped[bool] = mapped_column(Boolean, default=True)
    shuffle_options: Mapped[bool] = mapped_column(Boolean, default=True)
    review_policy: Mapped[str] = mapped_column(String(20), default="after_submit")
    multiple_policy: Mapped[str] = mapped_column(String(20), default="partial")

    questions: Mapped[list["Question"]] = relationship(
        back_populates="quiz", cascade="all, delete-orphan", order_by="Question.position",
        lazy="selectin",
    )


class Question(Base):
    __tablename__ = "questions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    type: Mapped[str] = mapped_column(String(20), default="single")
    prompt: Mapped[dict] = mapped_column(JSON, default=dict)
    explanation: Mapped[dict] = mapped_column(JSON, default=dict)
    points: Mapped[float] = mapped_column(Float, default=1)
    config: Mapped[dict] = mapped_column(JSON, default=dict)

    quiz: Mapped["Quiz"] = relationship(back_populates="questions")
    options: Mapped[list["QuestionOption"]] = relationship(
        back_populates="question", cascade="all, delete-orphan",
        order_by="QuestionOption.position", lazy="selectin",
    )


class QuestionOption(Base):
    __tablename__ = "question_options"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    # Never serialised while an attempt is in progress. Enforced by using a
    # separate response schema, not by remembering to filter the field.
    is_correct: Mapped[bool] = mapped_column(Boolean, default=False)

    question: Mapped["Question"] = relationship(back_populates="options")


class QuizAttempt(Base):
    __tablename__ = "quiz_attempts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    quiz_id: Mapped[str] = mapped_column(ForeignKey("quizzes.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1)
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    shuffle_seed: Mapped[int] = mapped_column(Integer, default=0)
    question_ids: Mapped[list] = mapped_column(JSON, default=list)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    deadline_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    score: Mapped[float] = mapped_column(Float, default=0)
    max_score: Mapped[float] = mapped_column(Float, default=0)
    score_percent: Mapped[float] = mapped_column(Float, default=0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="in_progress")

    answers: Mapped[list["QuizAnswer"]] = relationship(
        back_populates="attempt", cascade="all, delete-orphan", lazy="selectin"
    )


class QuizAnswer(Base):
    __tablename__ = "quiz_answers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    attempt_id: Mapped[str] = mapped_column(ForeignKey("quiz_attempts.id"), index=True)
    question_id: Mapped[str] = mapped_column(ForeignKey("questions.id"), index=True)
    answer: Mapped[dict] = mapped_column(JSON, default=dict)
    is_correct: Mapped[bool | None] = mapped_column(Boolean)
    points_awarded: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    attempt: Mapped["QuizAttempt"] = relationship(back_populates="answers")

    __table_args__ = (UniqueConstraint("attempt_id", "question_id", name="uq_answer_attempt_q"),)


# --------------------------------------------------------------------------- billing


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    subtotal_minor: Mapped[int] = mapped_column(Integer, default=0)
    tax_minor: Mapped[int] = mapped_column(Integer, default=0)
    total_minor: Mapped[int] = mapped_column(Integer, default=0)
    currency: Mapped[str] = mapped_column(String(3), default="OMR")
    tax_rate: Mapped[float] = mapped_column(Float, default=0)
    tax_country: Mapped[str] = mapped_column(String(2), default="OM")
    status: Mapped[str] = mapped_column(String(20), default="pending")
    provider: Mapped[str] = mapped_column(String(30), default="thawani")
    provider_session_id: Mapped[str | None] = mapped_column(String(120))
    idempotency_key: Mapped[str | None] = mapped_column(String(120), unique=True)
    last_checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    check_attempts: Mapped[int] = mapped_column(Integer, default=0)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Certificate(Base):
    __tablename__ = "certificates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"))
    serial_number: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    name_ar: Mapped[str | None] = mapped_column(String(160))
    name_en: Mapped[str | None] = mapped_column(String(160))
    score_percent: Mapped[float] = mapped_column(Float, default=0)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Review(Base):
    __tablename__ = "course_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=uid)
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    rating: Mapped[int] = mapped_column(Integer, default=5)
    content: Mapped[str | None] = mapped_column(Text)
    locale: Mapped[str] = mapped_column(String(5), default="ar")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    user: Mapped["User"] = relationship(lazy="selectin")

    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_review_course_user"),)
