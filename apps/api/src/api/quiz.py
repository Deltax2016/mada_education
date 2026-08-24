"""Quiz engine.

One invariant governs this module: correct answers never leave the server while
an attempt is in progress, and grading happens only on the server. That is
enforced structurally, by building the in-attempt payload from a function that
has no access to `is_correct`, rather than by remembering to strip a field.
"""

import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from ..core.deps import DB, CurrentUser, Locale
from ..core.errors import AppError, Conflict, NotFound
from ..core.i18n import ar_normalize, pick
from ..models import Question, QuestionOption, Quiz, QuizAnswer, QuizAttempt

router = APIRouter(prefix="/quizzes", tags=["quiz"])


def _question_for_attempt(question: Question, locale: str, seed: int, shuffle: bool) -> dict:
    """The in-attempt shape. `is_correct` is structurally absent here."""
    options = list(question.options)
    if shuffle:
        random.Random(seed + hash(question.id) % 10_000).shuffle(options)
    return {
        "id": question.id,
        "type": question.type,
        "prompt": pick(question.prompt, locale),
        "points": question.points,
        "config": {k: v for k, v in (question.config or {}).items() if k in ("unit", "placeholder")},
        "options": [
            {"id": o.id, "content": pick(o.content, locale)}
            for o in options
        ]
        if question.type in ("single", "multiple", "boolean")
        else [],
    }


def _grade(question: Question, answer: dict, multiple_policy: str) -> tuple[bool, float]:
    correct_ids = {o.id for o in question.options if o.is_correct}
    kind = question.type
    cfg = question.config or {}

    if kind in ("single", "boolean"):
        chosen = answer.get("optionId")
        ok = chosen in correct_ids
        return ok, question.points if ok else 0.0

    if kind == "multiple":
        chosen = set(answer.get("optionIds") or [])
        if not correct_ids:
            return False, 0.0
        if multiple_policy == "all_or_nothing":
            ok = chosen == correct_ids
            return ok, question.points if ok else 0.0
        hits = len(chosen & correct_ids)
        misses = len(chosen - correct_ids)
        ratio = max(0.0, (hits - misses) / len(correct_ids))
        return ratio == 1.0, round(question.points * ratio, 3)

    if kind == "short_text":
        given = answer.get("text") or ""
        accepted = cfg.get("accepted") or []
        # Arabic normalisation is not a nicety here: without it an answer typed
        # with a hamza or a diacritic is marked wrong, and the test looks broken.
        norm = ar_normalize(given)
        ok = any(ar_normalize(a) == norm for a in accepted)
        return ok, question.points if ok else 0.0

    if kind == "number":
        try:
            value = float(answer.get("value"))
        except (TypeError, ValueError):
            return False, 0.0
        target = float(cfg.get("target", 0))
        tolerance = float(cfg.get("tolerance", 0))
        ok = abs(value - target) <= tolerance
        return ok, question.points if ok else 0.0

    return False, 0.0


@router.post("/{quiz_id}/attempts")
async def start_attempt(quiz_id: str, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(Quiz).where(Quiz.id == quiz_id))
    quiz = result.scalar_one_or_none()
    if not quiz:
        raise NotFound("Quiz not found")

    existing = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.quiz_id == quiz_id,
            QuizAttempt.user_id == user.id,
            QuizAttempt.status == "in_progress",
        )
    )
    active = existing.scalar_one_or_none()
    if active:
        # Resuming rather than erroring: two tabs open is a normal accident.
        return await get_attempt(active.id, db, user, locale)

    past = await db.execute(
        select(QuizAttempt).where(
            QuizAttempt.quiz_id == quiz_id, QuizAttempt.user_id == user.id
        )
    )
    used = len(past.scalars().all())
    if quiz.max_attempts and used >= quiz.max_attempts:
        raise Conflict(
            "quiz.attempts_exhausted", "No attempts left", maxAttempts=quiz.max_attempts
        )

    questions = list(quiz.questions)
    seed = random.randint(1, 10**6)
    if quiz.shuffle_questions:
        random.Random(seed).shuffle(questions)

    attempt = QuizAttempt(
        quiz_id=quiz.id,
        user_id=user.id,
        attempt_number=used + 1,
        locale=locale,
        shuffle_seed=seed,
        question_ids=[q.id for q in questions],
        max_score=sum(q.points for q in questions),
        deadline_at=(
            datetime.now(timezone.utc) + timedelta(seconds=quiz.time_limit_seconds)
            if quiz.time_limit_seconds
            else None
        ),
    )
    db.add(attempt)
    await db.commit()
    return await get_attempt(attempt.id, db, user, locale)


@router.get("/attempts/{attempt_id}")
async def get_attempt(attempt_id: str, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt or attempt.user_id != user.id:
        raise NotFound("Attempt not found")

    quiz_result = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_result.scalar_one()

    by_id = {q.id: q for q in quiz.questions}
    ordered = [by_id[qid] for qid in attempt.question_ids if qid in by_id]

    saved = {a.question_id: a.answer for a in attempt.answers}

    return {
        "attemptId": attempt.id,
        "quizId": quiz.id,
        "title": pick(quiz.title, locale),
        "attemptNumber": attempt.attempt_number,
        "maxAttempts": quiz.max_attempts,
        "passingScore": quiz.passing_score,
        "status": attempt.status,
        "deadlineAt": attempt.deadline_at.isoformat() if attempt.deadline_at else None,
        "serverTime": datetime.now(timezone.utc).isoformat(),
        "questions": [
            _question_for_attempt(q, attempt.locale, attempt.shuffle_seed, quiz.shuffle_options)
            for q in ordered
        ],
        "answers": saved,
    }


class AnswerIn(BaseModel):
    answer: dict


@router.put("/attempts/{attempt_id}/answers/{question_id}")
async def save_answer(
    attempt_id: str, question_id: str, payload: AnswerIn, db: DB, user: CurrentUser
):
    result = await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt or attempt.user_id != user.id:
        raise NotFound("Attempt not found")
    if attempt.status != "in_progress":
        raise Conflict("quiz.attempt_closed", "Attempt already submitted")

    existing = await db.execute(
        select(QuizAnswer).where(
            QuizAnswer.attempt_id == attempt_id, QuizAnswer.question_id == question_id
        )
    )
    row = existing.scalar_one_or_none()
    if row:
        row.answer = payload.answer
    else:
        db.add(QuizAnswer(attempt_id=attempt_id, question_id=question_id, answer=payload.answer))
    await db.commit()
    return {"saved": True}


@router.post("/attempts/{attempt_id}/submit")
async def submit_attempt(attempt_id: str, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt or attempt.user_id != user.id:
        raise NotFound("Attempt not found")

    if attempt.status != "in_progress":
        return await get_result(attempt_id, db, user, locale)

    quiz_result = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_result.scalar_one()

    expired = False
    if attempt.deadline_at:
        deadline = attempt.deadline_at
        if deadline.tzinfo is None:
            deadline = deadline.replace(tzinfo=timezone.utc)
        expired = deadline < datetime.now(timezone.utc)

    by_id = {q.id: q for q in quiz.questions}
    answers = {a.question_id: a for a in attempt.answers}

    total = 0.0
    for question_id in attempt.question_ids:
        question = by_id.get(question_id)
        if not question:
            continue
        row = answers.get(question_id)
        if not row:
            continue
        ok, points = _grade(question, row.answer or {}, quiz.multiple_policy)
        row.is_correct = ok
        row.points_awarded = points
        total += points

    attempt.score = round(total, 3)
    attempt.score_percent = round(total / attempt.max_score * 100, 2) if attempt.max_score else 0
    attempt.passed = attempt.score_percent >= quiz.passing_score
    attempt.submitted_at = datetime.now(timezone.utc)
    attempt.status = "graded"
    await db.commit()

    if expired:
        # Everything autosaved before the deadline still counts. The attempt is
        # graded, the client is simply told the clock ran out.
        raise AppError(
            "quiz.attempt_expired", 410, "Time is up", scorePercent=attempt.score_percent
        )

    return await get_result(attempt_id, db, user, locale)


@router.get("/attempts/{attempt_id}/result")
async def get_result(attempt_id: str, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(QuizAttempt).where(QuizAttempt.id == attempt_id))
    attempt = result.scalar_one_or_none()
    if not attempt or attempt.user_id != user.id:
        raise NotFound("Attempt not found")
    if attempt.status == "in_progress":
        raise Conflict("quiz.attempt_in_progress", "Attempt is not submitted yet")

    quiz_result = await db.execute(select(Quiz).where(Quiz.id == attempt.quiz_id))
    quiz = quiz_result.scalar_one()

    show_answers = quiz.review_policy in ("immediately", "after_submit") or (
        quiz.review_policy == "after_pass" and attempt.passed
    )

    by_id = {q.id: q for q in quiz.questions}
    answers = {a.question_id: a for a in attempt.answers}

    review = []
    for question_id in attempt.question_ids:
        question = by_id.get(question_id)
        if not question:
            continue
        row = answers.get(question_id)
        item = {
            "questionId": question.id,
            "prompt": pick(question.prompt, attempt.locale),
            "type": question.type,
            "isCorrect": row.is_correct if row else False,
            "pointsAwarded": row.points_awarded if row else 0,
            "points": question.points,
            "answered": row is not None,
        }
        if show_answers:
            item["explanation"] = pick(question.explanation, attempt.locale)
            item["yourAnswer"] = row.answer if row else None
            item["correctOptions"] = [
                {"id": o.id, "content": pick(o.content, attempt.locale)}
                for o in question.options
                if o.is_correct
            ]
            if question.type in ("short_text", "number"):
                item["correctValue"] = (question.config or {}).get("accepted") or (
                    question.config or {}
                ).get("target")
        review.append(item)

    return {
        "attemptId": attempt.id,
        "status": attempt.status,
        "score": attempt.score,
        "maxScore": attempt.max_score,
        "scorePercent": attempt.score_percent,
        "passed": attempt.passed,
        "passingScore": quiz.passing_score,
        "attemptNumber": attempt.attempt_number,
        "maxAttempts": quiz.max_attempts,
        "showAnswers": show_answers,
        "review": review,
    }
