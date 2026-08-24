"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircleIcon, ClockIcon, XCircleIcon } from "@phosphor-icons/react";

import { Button, ButtonLink } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import { formatNumber, formatPercent, formatRatio, type Dict, type Locale } from "@/lib/i18n";
import type { QuizAttempt, QuizResult } from "@/lib/types";

type Answer = Record<string, unknown>;

export function QuizRunner({
  quizId,
  locale,
  dict,
  backHref,
}: {
  quizId: string;
  locale: Locale;
  dict: Dict;
  backHref: string;
}) {
  const [attempt, setAttempt] = useState<QuizAttempt | null>(null);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  // The server owns the deadline. The client clock is only used to render a
  // countdown, corrected by the offset measured when the attempt started.
  const offset = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/proxy/quizzes/${quizId}/attempts?locale=${locale}`, {
        method: "POST",
      });
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.code ?? "request.failed");
        return;
      }
      offset.current = Date.now() - new Date(data.serverTime).getTime();
      setAttempt(data);

      const restored = localStorage.getItem(`quiz-draft-${data.attemptId}`);
      setAnswers(restored ? { ...data.answers, ...JSON.parse(restored) } : data.answers ?? {});
    })();
    return () => {
      cancelled = true;
    };
  }, [quizId, locale]);

  const submit = useCallback(
    async (auto = false) => {
      if (!attempt || busy) return;
      setBusy(true);
      try {
        const res = await fetch(
          `/api/proxy/quizzes/attempts/${attempt.attemptId}/submit?locale=${locale}`,
          { method: "POST" },
        );
        const data = await res.json();
        localStorage.removeItem(`quiz-draft-${attempt.attemptId}`);
        if (!res.ok && data.code === "quiz.attempt_expired") {
          setError(dict.quiz.timeUp);
          const again = await fetch(
            `/api/proxy/quizzes/attempts/${attempt.attemptId}/result?locale=${locale}`,
          );
          if (again.ok) setResult(await again.json());
          return;
        }
        if (!res.ok) {
          setError(data.code ?? "request.failed");
          return;
        }
        if (auto) setError(dict.quiz.timeUp);
        setResult(data);
      } finally {
        setBusy(false);
      }
    },
    [attempt, busy, locale, dict.quiz.timeUp],
  );

  useEffect(() => {
    if (!attempt?.deadlineAt || result) return;
    const deadline = new Date(attempt.deadlineAt).getTime();
    const tick = () => {
      const left = Math.round((deadline - (Date.now() - offset.current)) / 1000);
      setRemaining(left);
      if (left <= 0) void submit(true);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [attempt, result, submit]);

  function saveAnswer(questionId: string, answer: Answer) {
    setAnswers((current) => {
      const nextState = { ...current, [questionId]: answer };
      if (attempt) {
        localStorage.setItem(`quiz-draft-${attempt.attemptId}`, JSON.stringify(nextState));
      }
      return nextState;
    });

    clearTimeout(timers.current[questionId]);
    timers.current[questionId] = setTimeout(() => {
      if (!attempt) return;
      fetch(`/api/proxy/quizzes/attempts/${attempt.attemptId}/answers/${questionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      }).catch(() => {
        /* the draft is in localStorage; submit resends everything */
      });
    }, 700);
  }

  const answeredCount = useMemo(
    () => (attempt ? attempt.questions.filter((q) => answers[q.id]).length : 0),
    [attempt, answers],
  );

  if (error && !attempt && !result) {
    // The failure has to name itself. "Could not load data" when the real
    // situation is "you are out of attempts" sends the learner to support.
    const exhausted = error === "quiz.attempts_exhausted";
    return (
      <div className="rounded-[var(--r-lg)] border border-border bg-surface p-8 text-center">
        <p className="text-lg font-semibold">
          {exhausted ? dict.quiz.exhaustedTitle : dict.common.somethingWrong}
        </p>
        <p className="mx-auto mt-2 max-w-[48ch] text-sm text-fg-muted">
          {exhausted ? dict.quiz.exhaustedBody : dict.common.checkConnection}
        </p>
        <ButtonLink href={backHref} variant="secondary" className="mt-5">
          {dict.quiz.backToCourse}
        </ButtonLink>
      </div>
    );
  }

  if (result) {
    return <ResultView result={result} dict={dict} locale={locale} backHref={backHref} note={error} />;
  }

  if (!attempt) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <div className="h-8 w-1/3 animate-pulse rounded-[var(--r-sm)] bg-surface-2" />
        {[0, 1, 2].map((index) => (
          <div key={index} className="h-40 animate-pulse rounded-[var(--r-lg)] bg-surface-2" />
        ))}
      </div>
    );
  }

  return (
    <>
      <header className="sticky top-[var(--nav-h)] z-30 -mx-5 border-b border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-5 py-3.5 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="truncate text-[1.05rem] font-semibold">{attempt.title}</h1>
          {remaining !== null ? (
            <span
              aria-live="polite"
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-[var(--r-sm)] px-2.5 py-1 text-sm font-medium ${
                remaining < 60 ? "bg-danger-soft text-danger" : "bg-surface-2 text-fg-muted"
              }`}
            >
              <ClockIcon size={15} aria-hidden />
              <span className="tnum">
                {Math.max(0, Math.floor(remaining / 60))}:
                {String(Math.max(0, remaining % 60)).padStart(2, "0")}
              </span>
            </span>
          ) : null}
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <Progress value={(answeredCount / attempt.questions.length) * 100} className="flex-1" />
          <span className="tnum shrink-0 text-xs text-fg-subtle">
            {formatRatio(locale, answeredCount, attempt.questions.length)}
          </span>
        </div>
      </header>

      <ol className="mt-8 grid gap-5">
        {attempt.questions.map((question, index) => (
          <li key={question.id}>
            <QuestionCard
              question={question}
              index={index + 1}
              total={attempt.questions.length}
              value={answers[question.id]}
              onChange={(answer) => saveAnswer(question.id, answer)}
              dict={dict}
              locale={locale}
            />
          </li>
        ))}
      </ol>

      <div className="sticky bottom-0 -mx-5 mt-8 border-t border-border bg-[color-mix(in_srgb,var(--bg)_92%,transparent)] px-5 py-4 backdrop-blur-md sm:-mx-8 sm:px-8">
        <Button size="lg" className="w-full" onClick={() => submit()} disabled={busy}>
          {busy ? dict.quiz.submitting : dict.quiz.submit}
        </Button>
      </div>
    </>
  );
}

function QuestionCard({
  question,
  index,
  total,
  value,
  onChange,
  dict,
  locale,
}: {
  question: QuizAttempt["questions"][number];
  index: number;
  total: number;
  value: Answer | undefined;
  onChange: (answer: Answer) => void;
  dict: Dict;
  locale: Locale;
}) {
  const inputClass =
    "h-12 w-full rounded-[var(--r-md)] border border-border-strong bg-bg px-4 text-fg " +
    "placeholder:text-fg-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-[var(--primary-ring)]";

  return (
    // A real fieldset with a legend, and real radio/checkbox inputs. Custom
    // div-based "options" lose keyboard support and screen reader grouping.
    <fieldset className="rounded-[var(--r-lg)] border border-border bg-surface p-5 sm:p-6">
      <legend className="contents">
        <p className="tnum text-xs font-medium text-fg-subtle">
          {dict.quiz.question} <span className="tnum">{formatNumber(locale, index)}</span>{" "}
          {dict.quiz.of} <span className="tnum">{formatNumber(locale, total)}</span>
        </p>
        <h2 className="mt-2 text-[1.05rem] font-semibold leading-relaxed">{question.prompt}</h2>
      </legend>

      {question.type === "multiple" ? (
        <p className="mt-1.5 text-xs text-fg-subtle">{dict.quiz.selectAll}</p>
      ) : null}

      <div className="mt-4 grid gap-2.5">
        {question.type === "single" || question.type === "boolean"
          ? question.options.map((option) => {
              const checked = value?.optionId === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[var(--r-md)] border p-3.5 transition-colors duration-200 ${
                    checked
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-border-strong hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="radio"
                    name={question.id}
                    checked={checked}
                    onChange={() => onChange({ optionId: option.id })}
                    className="size-[18px] shrink-0 accent-[var(--primary)]"
                  />
                  <span className="leading-snug">{option.content}</span>
                </label>
              );
            })
          : null}

        {question.type === "multiple"
          ? question.options.map((option) => {
              const selected = (value?.optionIds as string[] | undefined) ?? [];
              const checked = selected.includes(option.id);
              return (
                <label
                  key={option.id}
                  className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[var(--r-md)] border p-3.5 transition-colors duration-200 ${
                    checked
                      ? "border-primary bg-primary-soft"
                      : "border-border hover:border-border-strong hover:bg-surface-2"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() =>
                      onChange({
                        optionIds: checked
                          ? selected.filter((id) => id !== option.id)
                          : [...selected, option.id],
                      })
                    }
                    className="size-[18px] shrink-0 accent-[var(--primary)]"
                  />
                  <span className="leading-snug">{option.content}</span>
                </label>
              );
            })
          : null}

        {question.type === "short_text" ? (
          <input
            type="text"
            className={inputClass}
            placeholder={dict.quiz.typeAnswer}
            value={(value?.text as string) ?? ""}
            onChange={(event) => onChange({ text: event.target.value })}
          />
        ) : null}

        {question.type === "number" ? (
          <div className="flex items-center gap-3">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              dir="ltr"
              className={`${inputClass} tnum max-w-[220px] text-start`}
              placeholder={dict.quiz.typeAnswer}
              value={(value?.value as number | undefined) ?? ""}
              onChange={(event) =>
                onChange({ value: event.target.value === "" ? null : Number(event.target.value) })
              }
            />
            {question.config.unit ? (
              <span className="ltr-island text-sm text-fg-muted">{question.config.unit}</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </fieldset>
  );
}

function ResultView({
  result,
  dict,
  locale,
  backHref,
  note,
}: {
  result: QuizResult;
  dict: Dict;
  locale: Locale;
  backHref: string;
  note: string | null;
}) {
  const attemptsLeft = result.maxAttempts - result.attemptNumber;
  return (
    <div>
      {note ? (
        <p className="mb-5 rounded-[var(--r-md)] border border-border bg-warning-soft px-4 py-3 text-sm text-warning">
          {note}
        </p>
      ) : null}

      <div
        className={`rounded-[var(--r-xl)] border p-8 text-center sm:p-12 ${
          result.passed ? "border-primary bg-primary-soft" : "border-border bg-surface"
        }`}
      >
        <span
          className={`mx-auto grid size-14 place-items-center rounded-full ${
            result.passed ? "bg-primary text-on-primary" : "bg-danger-soft text-danger"
          }`}
        >
          {result.passed ? (
            <CheckCircleIcon size={28} weight="fill" aria-hidden />
          ) : (
            <XCircleIcon size={28} weight="fill" aria-hidden />
          )}
        </span>
        <h1 className="mt-5 text-2xl font-bold">
          {result.passed ? dict.quiz.passed : dict.quiz.failed}
        </h1>
        <p className="tnum mt-3 text-4xl font-bold">
          {formatPercent(locale, result.scorePercent)}
        </p>
        <p className="mt-2 text-sm text-fg-muted">
          {dict.quiz.passMark}:{" "}
          <span className="tnum">{formatPercent(locale, result.passingScore)}</span>
        </p>

        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {!result.passed && attemptsLeft > 0 ? (
            <Button onClick={() => window.location.reload()}>{dict.quiz.retry}</Button>
          ) : null}
          <ButtonLink href={backHref} variant={result.passed ? "primary" : "secondary"}>
            {dict.quiz.backToCourse}
          </ButtonLink>
        </div>
        {attemptsLeft > 0 ? (
          <p className="mt-4 text-xs text-fg-subtle">
            {dict.quiz.attemptsLeft}:{" "}
            <span className="tnum">{formatNumber(locale, attemptsLeft)}</span>
          </p>
        ) : null}
      </div>

      {result.showAnswers ? (
        <section className="mt-10">
          <h2 className="text-xl font-bold">{dict.quiz.review}</h2>
          <ol className="mt-5 grid gap-4">
            {result.review.map((item) => (
              <li
                key={item.questionId}
                className="rounded-[var(--r-lg)] border border-border bg-surface p-5"
              >
                <div className="flex items-start gap-3">
                  {item.isCorrect ? (
                    <CheckCircleIcon
                      size={20}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-primary"
                      aria-hidden
                    />
                  ) : (
                    <XCircleIcon
                      size={20}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-danger"
                      aria-hidden
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium leading-relaxed">{item.prompt}</p>
                    <p className="mt-1 text-xs font-medium text-fg-subtle">
                      {item.answered
                        ? item.isCorrect
                          ? dict.quiz.correct
                          : dict.quiz.incorrect
                        : dict.quiz.unanswered}
                    </p>

                    {!item.isCorrect && item.correctOptions?.length ? (
                      <p className="mt-3 text-sm">
                        <span className="text-fg-subtle">{dict.quiz.correctAnswer}: </span>
                        <span className="font-medium text-primary">
                          {item.correctOptions.map((option) => option.content).join(" · ")}
                        </span>
                      </p>
                    ) : null}

                    {item.explanation ? (
                      <p className="mt-3 border-s-2 border-border ps-3 text-sm leading-relaxed text-fg-muted">
                        {item.explanation}
                      </p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}
