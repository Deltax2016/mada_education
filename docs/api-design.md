# Дизайн API

REST + JSON, OpenAPI 3.1 генерируется из Pydantic. Единственный потребитель сегодня — Next.js BFF, но контракт пишется так, будто завтра появится мобильное приложение (оно появится).

---

## 1. Конвенции

### База и версия
```
https://api.mada.example/api/v1
```
Версия в пути. Ломающее изменение = `/v2` и параллельная работа обеих версий минимум один цикл. Внутри `v1` разрешены только аддитивные изменения.

### Именование
- Пути — множественное число, kebab-case: `/courses`, `/quiz-attempts`.
- Поля JSON — **camelCase**. На бэкенде Pydantic с `alias_generator=to_camel`, `populate_by_name=True`. Одна строчка конфига, зато фронт и будущий Swift/Kotlin-клиент получают идиоматичные модели.
- Даты — ISO 8601 с зоной: `2026-03-15T09:30:00Z`. **Всегда UTC.** Никаких «локальных» дат в API.
- Длительности — целые секунды, поля с суффиксом: `durationSeconds`.
- Деньги — **никогда** не число с плавающей точкой:
```json
{ "amount": { "minor": 12500, "currency": "OMR", "exponent": 3, "display": "12.500" } }
```
`12500` при exponent 3 = 12.500 OMR. Клиент форматирует через `Intl.NumberFormat`, но `display` отдаётся как подстраховка для мест, где формат нужен без логики (письма, PDF).

### Заголовки

| Заголовок | Назначение |
|---|---|
| `Accept-Language: ar, en;q=0.8` | локаль контента; перекрывается `?locale=` |
| `Idempotency-Key` | обязателен на всех POST, создающих деньги или попытки |
| `X-Request-Id` | сквозной id, генерирует Traefik, прокидывает BFF |
| `If-None-Match` / `ETag` | кэширование контента уроков и каталога |
| `X-Client` | `web/1.4.2`, `ios/1.0.0` — для аналитики и форс-апдейта |

### Ответ с локалью
Любой ответ с локализуемым контентом несёт:
```json
{ "data": { … }, "meta": { "locale": "ar", "resolvedLocale": "en", "isFallback": true } }
```

---

## 2. Ошибки — RFC 9457 Problem Details

`Content-Type: application/problem+json`

```json
{
  "type": "https://api.mada.example/errors/quiz-attempts-exhausted",
  "title": "Quiz attempts exhausted",
  "status": 409,
  "code": "quiz.attempts_exhausted",
  "detail": "Maximum of 3 attempts reached",
  "instance": "/api/v1/quizzes/8f2.../attempts",
  "requestId": "01HX…",
  "meta": { "maxAttempts": 3, "lastAttemptAt": "2026-03-15T09:30:00Z" }
}
```

**`code` — контракт, `detail` — для разработчика.** Клиент показывает пользователю строку, найденную по `code` в своих переводах. Сервер не отправляет текст для UI ни на арабском, ни на английском — иначе локализация ошибок расползается по двум кодовым базам и мобильное приложение не сможет их перевести.

Ошибки валидации:
```json
{
  "status": 422, "code": "validation_failed",
  "errors": [
    { "field": "email", "code": "auth.email_invalid" },
    { "field": "answers[2].value", "code": "required" }
  ]
}
```

### Реестр кодов (фрагмент)

| HTTP | code | Когда |
|---|---|---|
| 400 | `request.malformed` | битый JSON |
| 401 | `auth.unauthenticated` | нет/протух access-токен |
| 401 | `auth.code_invalid` | неверный код |
| 401 | `auth.code_expired` | код протух |
| 422 | `auth.email_invalid` | адрес не похож на email |
| 502 | `auth.email_send_failed` | письмо не ушло |
| 403 | `auth.forbidden` | роли не хватает |
| 403 | `access.paywall` | нет активного enrollment |
| 403 | `access.locked_prerequisite` | не пройден урок-предусловие |
| 403 | `access.locked_schedule` | drip ещё не открыл |
| 403 | `access.expired` | срок доступа истёк |
| 404 | `resource.not_found` | |
| 409 | `quiz.attempt_in_progress` | уже есть незавершённая попытка |
| 409 | `quiz.attempts_exhausted` | лимит попыток |
| 409 | `order.already_paid` | повторная оплата |
| 410 | `quiz.attempt_expired` | вышло время |
| 413 | `upload.too_large` | |
| 422 | `validation_failed` | |
| 429 | `rate_limited` | + `Retry-After` |
| 503 | `payment.provider_unavailable` | Thawani не отвечает |

---

## 3. Пагинация

**Курсорная** для всего, что растёт (события, комментарии, уведомления, лента):
```
GET /courses/{id}/comments?cursor=eyJ0IjoiMjAyNi0wMy0xNSJ9&limit=20

{ "data": [ … ], "pageInfo": { "nextCursor": "…", "hasMore": true } }
```
Offset-пагинация — только в админских таблицах, где нужен переход на страницу N:
```
GET /admin/users?page=3&perPage=50   →  { "data": [...], "page": {...,"total": 4812} }
```
`COUNT(*)` по большим таблицам считается приблизительно (`reltuples`) — точный счёт на миллионах строк съедает секунды.

---

## 4. Аутентификация

Браузер не работает с API напрямую. Схема:

```
Браузер ──cookie(HttpOnly)──▶ Next.js BFF ──Bearer──▶ FastAPI
```

BFF хранит access/refresh в HttpOnly-cookie, подставляет `Authorization: Bearer`, сам обновляет access по 401 и повторяет запрос один раз. Мобильное приложение будет работать с Bearer напрямую — та же схема, другой хранитель токенов.

### Эндпоинты

```
POST   /auth/email/code         { email }                → { otpId, expiresIn, email }
POST   /auth/email/verify       { otpId, code, nameAr?, nameEn? }
                                                         → { accessToken, refreshToken, isNewUser, user }
POST   /auth/refresh            { refreshToken }         → ротация, старый инвалидируется
POST   /auth/logout             текущая сессия
POST   /auth/logout-all         все сессии пользователя
GET    /auth/sessions           список устройств
DELETE /auth/sessions/{id}
GET    /auth/me                 профиль + роли + права + локаль
```

Паролей нет, поэтому нет и эндпоинтов регистрации и восстановления: первый успешный ввод кода создаёт аккаунт.

`/auth/email/code` отвечает одинаково независимо от того, существует адрес или нет. Разный ответ превратил бы его в перечислитель аккаунтов.

Лимиты: `email/code` — 3 за 15 минут на адрес и 20 в час на IP; `email/verify` — 5 попыток на код. При исчерпании — 429 с `Retry-After`.

---

## 5. Публичный каталог

```
GET  /catalog/courses?category=&level=&locale=&q=&sort=&cursor=
GET  /catalog/courses/{slug}          карточка курса + программа + превью-уроки
GET  /catalog/categories
GET  /catalog/courses/{slug}/reviews
GET  /catalog/search?q=               курсы + уроки + транскрипты
```

Кэшируются в Redis на 5 минут + `ETag`. Инвалидация по событию `course.published`.
Программа курса в публичной карточке отдаёт названия уроков, но **никогда** не блоки контента — иначе платный курс читается без покупки.

---

## 6. Обучение

```
GET  /learn/courses                            мои курсы + прогресс
GET  /learn/courses/{id}                       структура + статус доступа по каждому уроку
GET  /learn/lessons/{id}?locale=ar             ← главный эндпоинт, здесь работает AccessPolicy
POST /learn/lessons/{id}/progress              { positionSeconds, watchedDelta, blocksSeen[] }
POST /learn/lessons/{id}/complete
GET  /learn/courses/{id}/continue              куда вернуться
POST /learn/notes                              заметка, опционально к таймкоду
GET  /learn/notes?lessonId=
POST /learn/bookmarks/{lessonId}
```

`GET /learn/lessons/{id}` — единственный источник контента урока. Возвращает `401 auth.unauthenticated` для анонима и `403` с конкретным `code` (`access.paywall` / `access.expired` / …) для вошедшего. Разделение по статусу отделяет «войди» от «купи»: это разные экраны.

Прогресс: heartbeat раз в 20 секунд, батчами, на `visibilitychange` и `pagehide` — через `navigator.sendBeacon`. Эндпоинт идемпотентен и терпит дубли и опоздавшие пакеты (берёт максимум позиции, а не последнее значение).

---

## 7. Квизы

```
POST /quizzes/{id}/attempts                     старт попытки
GET  /quizzes/attempts/{attemptId}              вопросы БЕЗ правильных ответов
PUT  /quizzes/attempts/{attemptId}/answers/{questionId}   автосохранение (upsert)
POST /quizzes/attempts/{attemptId}/submit
GET  /quizzes/attempts/{attemptId}/result       по review_policy
GET  /quizzes/{id}/attempts                     история попыток
```

Жёсткие правила:
- `question_options.is_correct` **никогда** не попадает в ответ во время попытки. Обеспечивается отдельной Pydantic-схемой `QuestionForAttempt`, а не фильтрацией «не забыть».
- `deadline_at` считает сервер при старте. Клиентский таймер — индикатор; сервер отклонит `submit` после дедлайна с `410 quiz.attempt_expired` и зачтёт то, что успело автосохраниться.
- Параллельные попытки блокируются частичным уникальным индексом, а не проверкой в коде.

Детали — [quiz-engine.md](quiz-engine.md).

---

## 8. Домашние задания

```
GET  /assignments/{id}
POST /assignments/{id}/submissions            черновик/сдача
POST /submissions/{id}/submit
GET  /submissions/{id}
GET  /review/queue?courseId=&status=          очередь куратора
POST /submissions/{id}/reviews                вердикт + баллы + рубрика
```

---

## 9. Медиа

```
POST /media/uploads                { kind, filename, sizeBytes, mimeType }
                                   → { assetId, uploadUrl | parts[], expiresAt }
POST /media/uploads/{id}/complete  { parts?: [{ partNumber, etag }] }
GET  /media/assets/{id}            статус обработки
GET  /media/assets/{id}/playback   → { hlsUrl | mp4Url, posterUrl, subtitles[], expiresIn }
```

`/playback` — единственный способ получить ссылку на видео. Внутри дергается `AccessPolicy`, ссылка подписывается на 4 часа, факт выдачи логируется. Прямых публичных URL на платное видео не существует.

---

## 10. Оплата

```
GET  /billing/products/{id}
POST /billing/orders               { productId, promoCode?, country }  → расчёт с НДС
POST /billing/orders/{id}/checkout → { redirectUrl, provider, sessionId }
GET  /billing/orders/{id}          статус (фронт поллит на return-странице)
GET  /billing/orders               история
POST /billing/orders/{id}/cancel
GET  /billing/invoices/{id}/pdf

POST /webhooks/payments/{provider} без auth, проверка подписи, ответ 200 сразу
```

`POST /orders` обязателен `Idempotency-Key`. Возврат пользователя на `success_url` **не меняет статус заказа** — фронт лишь начинает поллить `GET /billing/orders/{id}`, а статус переводит воркер после серверной проверки у провайдера. См. [billing-gulf.md](billing-gulf.md).

---

## 11. Сертификаты, соцфункции, уведомления

```
GET  /certificates                       мои
GET  /certificates/{id}/pdf?locale=ar
GET  /public/verify/{serial}             без авторизации, отдаёт минимум данных

GET  /comments?entityType=&entityId=&cursor=
POST /comments
PATCH/DELETE /comments/{id}
POST /comments/{id}/reactions
POST /courses/{id}/reviews

GET  /notifications?cursor=
POST /notifications/{id}/read
POST /notifications/read-all
GET/PUT /notifications/preferences
GET  /public/unsubscribe/{token}         без авторизации
```

Публичная верификация сертификата отдаёт только имя, курс, дату и статус. Ни телефона, ни email, ни оценки по урокам — страница индексируется и открыта всем.

---

## 12. Админ и авторский API

```
/admin/courses            CRUD, публикация, дублирование, экспорт/импорт
/admin/lessons/{id}/versions/{locale}      draft, публикация, откат
/admin/lessons/{id}/translations           матрица готовности, XLIFF export/import
/admin/quizzes …          банк вопросов, статистика по вопросам
/admin/users              поиск, блокировка, выдача/отзыв доступа, impersonation
/admin/enrollments/bulk   массовая выдача, импорт CSV
/admin/cohorts            потоки, drip-правила
/admin/orders             заказы, ручная сверка, возвраты
/admin/analytics/*        воронка, отвал по урокам, сложность вопросов, ar vs en
/admin/notifications      рассылки, шаблоны
/admin/feature-flags
/admin/audit-log
```

Impersonation («войти как пользователь») — только для `support`/`admin`, с обязательной записью в `audit_log`, ограничением по времени и явным баннером в интерфейсе. Действия под impersonation, меняющие деньги или доступ, запрещены.

---

## 13. Realtime

Не WebSocket, а **SSE** — этого достаточно и переживает любой прокси:

```
GET /events/stream        (уведомления, статус транскода, статус оплаты)
```
Fallback — поллинг. WebSocket появится, только если будут живые вебинары или совместное редактирование.

---

## 14. Rate limiting

| Группа | Лимит |
|---|---|
| `auth/email/code` | 3 / 15 мин на адрес, 20 / час на IP |
| `auth/*` прочее | 20 / мин на IP |
| `billing/orders`, `checkout` | 10 / час на пользователя |
| `media/uploads` | 30 / час на пользователя |
| `learn/*/progress` | 120 / мин на пользователя (heartbeat) |
| чтение | 300 / мин на пользователя |
| публичный каталог | 60 / мин на IP |

Реализация — Redis, скользящее окно. Ответ 429 + `Retry-After` + `X-RateLimit-Remaining`.

---

## 15. Кэширование

| Что | Где | TTL | Инвалидация |
|---|---|---|---|
| Каталог, карточка курса | Redis + `ETag` | 5 мин | событие `course.published` |
| Структура курса | Redis | 10 мин | событие `lesson.published` |
| Контент урока | `ETag` (без Redis) | — | версия урока в `ETag` |
| Профиль, роли | Redis | 60 сек | изменение пользователя |
| Ссылка на видео | не кэшируется | — | подписана на 4 ч |

Персонализированные ответы (`/learn/*`) — `Cache-Control: private, no-store`. Утечка чужого прогресса через CDN-кэш — реальный риск, если про это забыть.

---

## 16. Кодоген клиента

```bash
make gen   # FastAPI → openapi.json → orval → packages/api-client
```

CI падает, если сгенерированный клиент отличается от закоммиченного — значит, кто-то поменял API и не пересобрал контракт. Дешёвая защита от рассинхрона фронта и бэка.
