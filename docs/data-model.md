# Модель данных

PostgreSQL 17. Расширения: `pgcrypto`, `citext`, `pg_trgm`, `unaccent`, `vector`.

## Сквозные соглашения

| Правило | Почему |
|---|---|
| PK — `uuid` (`gen_random_uuid()`) | не раскрывает объёмы, безопасно мержить данные |
| `created_at` / `updated_at` — `timestamptz`, всегда UTC | хиджра и локальные зоны — только слой отображения |
| `organization_id` в ключевых таблицах с первого дня | добавить в живую БД с данными практически нельзя |
| Локализуемые короткие поля — `jsonb` `{"ar": …, "en": …}` | одна строка = вся сущность, ноль джойнов |
| Деньги — `amount_minor bigint` + `currency char(3)` | OMR/KWD/BHD имеют **3** знака после запятой |
| Email — `citext`, `unique`, `not null` | единственный идентификатор пользователя |
| Мягкое удаление (`deleted_at`) — только `users`, `courses`, `comments` | остальное удаляется физически |
| Денормализация `course_id` в дочерних таблицах — намеренная | убирает джойн на каждом запросе плеера |

### Справочник валют — не хардкод

```sql
currencies (
  code char(3) primary key,      -- OMR, SAR, AED, KWD, BHD, QAR, USD
  exponent smallint not null,     -- OMR/KWD/BHD = 3, остальные = 2
  symbol jsonb,                   -- {"ar": "ر.ع.", "en": "OMR"}
  is_active boolean
);
```
Всё форматирование и вся арифметика идут через `core/money.py`, который читает `exponent` отсюда. Литерал `/ 100` в коде — повод завернуть ревью.

---

## Identity

```sql
users (
  id                uuid pk,
  organization_id   uuid not null,

  email             citext unique not null, -- единственный идентификатор
  email_verified_at timestamptz,
                                            -- паролей нет: вход только по коду из письма

  first_name        text,
  last_name         text,
  name_ar           text,                   -- имя арабской графикой (для сертификата)
  name_en           text,                   -- латинская транслитерация (для сертификата)
  avatar_url        text,

  locale            text default 'ar',      -- влияет на письма и PDF
  timezone          text default 'Asia/Muscat',
  country           char(2),                -- ISO 3166-1 alpha-2: OM, SA, AE… нужно для НДС
  numbering_system  text default 'latn',    -- latn | arab
  calendar_pref     text default 'gregory', -- gregory | islamic-umalqura

  status            text default 'active',  -- active | blocked | deleted
  last_seen_at      timestamptz,
  deleted_at        timestamptz,
  created_at, updated_at
);
-- index: (organization_id, status), (country)
```

```sql
otp_codes (
  id, purpose,                    -- login | verify_email | payment_confirm
  destination text,               -- email
  code_hash text,                 -- храним хэш, не сам код
  channel text,                   -- email
  attempts smallint default 0,
  expires_at timestamptz,
  consumed_at timestamptz,
  ip inet, created_at
);
-- index: (destination, purpose, created_at desc)
-- Ограничения: TTL 5 мин, максимум 5 попыток ввода,
--              не более 3 отправок на адрес за 15 минут.

oauth_accounts (id, user_id, provider, provider_user_id, unique(provider, provider_user_id));

sessions (
  id, user_id,
  refresh_token_hash text,
  family_id uuid,                 -- ротация: переиспользование старого => revoke всего family
  device_label text, user_agent text, ip inet,
  expires_at, revoked_at, created_at
);
-- index: (user_id, revoked_at)

roles (id, code, name jsonb);     -- student | instructor | curator | support | admin
user_roles (user_id, role_id, pk(user_id, role_id));

email_tokens (id, user_id, type, token_hash, expires_at, used_at);

consents (                        -- требование PDPL: доказуемое согласие
  id, user_id, kind,              -- terms | privacy | marketing
  version text, granted boolean,
  ip inet, user_agent text, created_at
);

audit_log (
  id bigserial, actor_user_id, impersonated_by,
  action text, entity_type text, entity_id uuid,
  before jsonb, after jsonb, ip inet, created_at
);
-- index: (entity_type, entity_id, created_at desc), (actor_user_id, created_at desc)
```

---

## Catalog

```sql
categories (id, organization_id, slug, title jsonb, description jsonb, parent_id, position, icon);

courses (
  id, organization_id,
  slug text,                              -- латиницей, общий для локалей
  title jsonb, subtitle jsonb, description jsonb, outcomes jsonb, requirements jsonb,
  cover_url text, promo_video_asset_id uuid,

  level text,                             -- beginner | intermediate | advanced
  default_locale text default 'ar',
  available_locales text[] default '{ar}',
  duration_minutes int,

  status text,                            -- draft | published | archived
  visibility text,                        -- public | unlisted | private
  is_free boolean,
  default_product_id uuid,                -- цена живёт в billing, а не здесь

  instructor_ids uuid[],                  -- денормализация для карточки каталога
  rating_avg numeric(3,2), rating_count int, students_count int,

  search_tsv tsvector generated,          -- см. i18n-rtl.md §6
  published_at, created_by, created_at, updated_at, deleted_at
);
-- unique(organization_id, slug); index (organization_id, status, visibility);
-- gin(search_tsv); gin(available_locales)

course_categories (course_id, category_id, pk(course_id, category_id));

course_members (                          -- скоупленные права, а не глобальная роль
  course_id, user_id, role,               -- instructor | curator
  created_at, pk(course_id, user_id, role)
);

modules (id, course_id, title jsonb, description jsonb, position, status);

lessons (
  id, module_id,
  course_id,                              -- денормализовано намеренно
  slug text,
  type text,                              -- content | video | quiz | assignment | live | final_exam
  position int,
  duration_minutes int,
  is_preview boolean default false,       -- доступен без покупки
  is_required boolean default true,       -- влияет на % прогресса и сертификат
  status text,                            -- draft | published
  created_at, updated_at
);
-- unique(course_id, slug); index (course_id, position)

lesson_versions (
  id, lesson_id,
  locale text,                            -- 'ar' | 'en' — контент независим по локалям
  version int,
  status text,                            -- draft | published | archived
  content jsonb,                          -- массив блоков, см. architecture.md §4
  translation_status text,                -- missing | machine | human_review | done
  translated_from text,                   -- исходная локаль, если это перевод
  created_by, published_at, created_at
);
-- unique(lesson_id, locale, version)
-- partial unique (lesson_id, locale) where status='published'
-- partial unique (lesson_id, locale) where status='draft'

lesson_prerequisites (lesson_id, required_lesson_id, pk(lesson_id, required_lesson_id));
lesson_attachments (id, lesson_id, locale, media_asset_id, title jsonb, position);
lesson_media (lesson_id, locale, media_asset_id, role);   -- role: main_video | audio
```

**Почему контент урока — отдельная строка на локаль, а не JSONB с ключами локалей:** блоки объёмные (десятки килобайт), версионируются независимо, и арабская версия может быть опубликована, пока английская в переводе. Класть их в одну строку — гарантированные конфликты при параллельном редактировании.

---

## Enrollment и доступ

```sql
cohorts (
  id, course_id, title jsonb,
  starts_at, ends_at,
  drip_mode text,                 -- none | by_schedule | by_progress
  weekend_days smallint[],        -- по умолчанию {5,6} — пт, сб
  capacity int, status
);

enrollments (
  id, user_id, course_id, cohort_id,
  source text,                    -- purchase | manual | promo | invite | subscription | b2b_seat
  order_id uuid,
  locale text,                    -- на каком языке студент проходит курс
  access_starts_at timestamptz,
  access_ends_at   timestamptz,   -- null = бессрочно
  status text,                    -- active | expired | revoked | completed
  progress_percent numeric(5,2) default 0,
  completed_at timestamptz,
  created_at
);
-- unique(user_id, course_id, cohort_id); index (user_id, status), (course_id, status)

drip_rules (
  id, cohort_id,
  target_type text, target_id uuid,      -- module | lesson
  unlock_after_days int,                 -- от старта потока или от enrollment
  skip_weekends boolean default true,
  unlock_at timestamptz,                 -- либо абсолютная дата
  requires_completion_of uuid            -- либо по завершению другого элемента
);

invites (id, course_id, email, token_hash, expires_at, accepted_at, created_by);

b2b_accounts (id, organization_id, company_name jsonb, vat_number, contact_user_id, billing_email);
b2b_seats (id, b2b_account_id, course_id, seats_total, seats_used, valid_until);
```

`AccessPolicy` — сервис, а не таблица. Единственное место, где сходятся enrollment + срок + drip + пререквизиты + `is_preview` + роль + статус публикации. Результат: `allowed | paywall | locked_prerequisite | locked_schedule | expired | not_published`.

---

## Learning

```sql
lesson_progress (
  id, user_id, lesson_id, course_id, enrollment_id,
  locale text,
  status text,                     -- not_started | in_progress | completed
  progress_percent numeric(5,2),
  last_position_seconds int,
  watched_seconds int,
  blocks_seen text[],              -- id блоков — «докуда дочитал»
  first_opened_at, completed_at, updated_at
);
-- unique(user_id, lesson_id); index (user_id, course_id), (enrollment_id)

course_progress (                  -- агрегат, пересчитывается воркером
  user_id, course_id,
  lessons_total, lessons_completed,
  progress_percent numeric(5,2),
  score_percent numeric(5,2),
  last_lesson_id, last_activity_at,
  pk(user_id, course_id)
);

learning_events (                  -- append-only; партиционировать по месяцам при росте
  id bigserial, user_id, course_id, lesson_id,
  type text, payload jsonb,
  session_id uuid, locale text, device text,
  occurred_at timestamptz
);
-- index (course_id, occurred_at), (user_id, occurred_at), (type, occurred_at)

notes      (id, user_id, lesson_id, content text, timestamp_seconds int, created_at);
bookmarks  (user_id, lesson_id, created_at, pk(user_id, lesson_id));
```

---

## Quiz

```sql
quizzes (
  id, course_id, lesson_id,
  title jsonb, description jsonb,
  time_limit_seconds int,
  max_attempts int,
  passing_score numeric(5,2),
  shuffle_questions boolean, shuffle_options boolean,
  questions_per_attempt int,          -- выборка N из банка
  review_policy text,                 -- immediately | after_submit | after_pass | never
  show_correct_answers boolean,
  weight numeric,
  is_final_exam boolean
);

questions (
  id, quiz_id, position,
  type text,        -- single | multiple | boolean | short_text | number
                    -- | matching | ordering | fill_blank | essay | hotspot | code
  prompt jsonb,     -- {"ar": [блоки], "en": [блоки]} — текст, картинки, код
  explanation jsonb,
  points numeric default 1,
  difficulty text,
  config jsonb,     -- специфика типа: допуск числа, маски текста, регистрозависимость
  stats jsonb       -- p-value, discrimination index — пересчитываются ночью
);

question_options (
  id, question_id, position,
  content jsonb,             -- локализованный текст/картинка
  is_correct boolean,        -- НИКОГДА не сериализуется в API во время попытки
  match_key text,            -- для matching/ordering
  feedback jsonb
);

quiz_attempts (
  id, quiz_id, user_id, enrollment_id,
  attempt_number int,
  locale text,
  shuffle_seed int,
  question_ids uuid[],       -- зафиксированная выборка для этой попытки
  started_at, deadline_at,   -- серверный дедлайн; клиентский таймер — только индикатор
  submitted_at, graded_at,
  score numeric, max_score numeric, score_percent numeric(5,2),
  passed boolean,
  status text                -- in_progress | submitted | graded | expired
);
-- index (user_id, quiz_id)
-- partial unique (user_id, quiz_id) where status = 'in_progress'

quiz_answers (
  id, attempt_id, question_id,
  answer jsonb,              -- форма зависит от типа, см. quiz-engine.md
  is_correct boolean, points_awarded numeric,
  graded_by uuid, feedback jsonb,
  answered_at, updated_at
);
-- unique(attempt_id, question_id) — автосохранение идемпотентно через upsert
```

---

## Assignment

```sql
assignments (
  id, lesson_id, course_id,
  title jsonb, description jsonb,
  submission_types text[],       -- text | file | link | code
  max_files smallint, max_file_size_mb int, allowed_extensions text[],
  max_score numeric, passing_score numeric,
  due_at timestamptz, allow_late boolean, late_penalty_percent numeric,
  max_resubmissions smallint,
  review_mode text,              -- curator | peer | auto
  rubric jsonb                   -- критерии оценивания, локализованные
);

submissions (
  id, assignment_id, user_id, enrollment_id,
  attempt_number smallint,
  content jsonb, file_ids uuid[],
  status text,                   -- draft | submitted | in_review | approved | needs_rework | rejected
  is_late boolean,
  submitted_at, assigned_reviewer_id
);
-- index (assignment_id, status), (assigned_reviewer_id, status)

reviews (
  id, submission_id, reviewer_id,
  score numeric, verdict text,
  comment jsonb, rubric_scores jsonb,
  created_at
);
```

---

## Media

```sql
media_assets (
  id, organization_id, owner_id,
  kind text,                     -- video | image | audio | document | subtitle
  locale text,                   -- у видео с озвучкой — своё на каждый язык
  provider text default 's3',    -- s3 | cloudflare_stream
  provider_asset_id text,
  storage_key text,
  original_filename text, mime_type text, size_bytes bigint, checksum text,
  status text,                   -- uploading | processing | ready | failed
  duration_seconds numeric, width int, height int,
  poster_key text, hls_manifest_key text,
  metadata jsonb, created_at
);
-- index (organization_id, kind, status)

media_renditions (id, asset_id, quality, storage_key, bitrate_kbps, size_bytes, codec);
subtitles       (id, asset_id, locale, storage_key, is_auto_generated, is_default);
transcripts     (id, asset_id, locale, segments jsonb, search_tsv tsvector generated);
transcode_jobs  (id, asset_id, status, attempts, error, started_at, finished_at);
upload_sessions (id, user_id, asset_id, upload_id, parts jsonb, expires_at);
```

---

## Billing

```sql
products (
  id, organization_id,
  type text,                     -- course | bundle | subscription_plan | b2b_seats
  title jsonb, description jsonb,
  course_ids uuid[],
  price_minor bigint, currency char(3),
  compare_at_minor bigint,       -- зачёркнутая цена
  tax_mode text,                 -- inclusive | exclusive
  access_days int,               -- null = бессрочно
  status text
);

product_prices (                 -- цена по стране/валюте, если нужна региональная политика
  id, product_id, country char(2), currency char(3), price_minor bigint
);

orders (
  id, organization_id, user_id, product_id,
  subtotal_minor bigint, discount_minor bigint,
  tax_minor bigint, tax_rate numeric(5,4), tax_country char(2),
  total_minor bigint, currency char(3),

  status text,                   -- pending | paid | failed | canceled | refunded | partially_refunded
  provider text,                 -- thawani | paytabs | tap | stripe
  provider_session_id text,      -- Thawani checkout session_id
  provider_payment_id text,
  client_reference_id text,      -- = order.id, передаётся в Thawani
  idempotency_key text unique,

  paid_at, expires_at,           -- pending-заказ протухает через 30 мин
  last_checked_at timestamptz,   -- когда воркер сверки последний раз опрашивал провайдера
  check_attempts smallint,
  invoice_number text unique,
  metadata jsonb, created_at
);
-- index (status, last_checked_at) — рабочий индекс для reconciliation-воркера
-- index (user_id, created_at desc)

payment_events (                 -- сырьё от провайдера: и вебхуки, и результаты опроса
  id, provider, external_id text,
  kind text,                     -- webhook | poll | return_url
  payload jsonb, signature_valid boolean,
  order_id uuid, processed_at, error,
  created_at,
  unique(provider, external_id, kind)
);

subscriptions (id, user_id, plan_id, status, current_period_end, cancel_at_period_end, provider_sub_id);

promo_codes (
  id, organization_id, code citext unique,
  discount_type text,            -- percent | fixed
  discount_value numeric, discount_currency char(3),
  applies_to_product_ids uuid[],
  max_uses int, used_count int, per_user_limit smallint,
  valid_from, valid_until, status
);
promo_redemptions (id, promo_code_id, user_id, order_id, created_at,
                   unique(promo_code_id, user_id, order_id));

refunds (id, order_id, amount_minor, currency, reason, status, provider_refund_id, created_at);

tax_rates (country char(2), rate numeric(5,4), valid_from, valid_to);
-- Оман 5%, КСА 15%, ОАЭ 5%, Бахрейн 10%, Катар/Кувейт — 0.
-- Ставки меняются: держать в таблице с датами, не в коде.

invoices (id, order_id, number text unique, pdf_key, issued_at, tax_details jsonb);
```

Подробности потоков оплаты и специфика Thawani — [billing-gulf.md](billing-gulf.md).

---

## Certificates

```sql
certificate_templates (
  id, organization_id, code,
  locale text,                   -- шаблон на каждую локаль
  html_template text, css text,
  variables jsonb, preview_url
);

certificates (
  id, user_id, course_id, enrollment_id,
  serial_number text unique,     -- публичный номер: /verify/{serial}
  verification_hash text,        -- защита от подбора номера
  name_ar text, name_en text,    -- снимок имени на момент выдачи
  score_percent numeric(5,2),
  issued_at, expires_at,
  template_id, pdf_key,
  revoked_at, revoke_reason
);
```

---

## Social

```sql
comments (
  id, entity_type, entity_id,      -- lesson | assignment | announcement
  course_id,                       -- денормализовано для модерации по курсу
  user_id, parent_id,
  content jsonb, locale text,
  status text,                     -- published | pending | hidden | deleted
  is_pinned, is_instructor_answer,
  reactions_count int, replies_count int,
  created_at, edited_at
);
-- index (entity_type, entity_id, created_at desc), (course_id, status)

comment_reactions (comment_id, user_id, type, pk(comment_id, user_id, type));

course_reviews (
  id, course_id, user_id, rating smallint, content text, locale text,
  status text, created_at, unique(course_id, user_id)
);
```

---

## Gamification

```sql
badges       (id, organization_id, code, title jsonb, description jsonb, icon_url, criteria jsonb);
user_badges  (user_id, badge_id, awarded_at, pk(user_id, badge_id));
points_ledger(id, user_id, delta int, reason text, entity_type, entity_id, created_at);  -- append-only
streaks      (user_id pk, current_days int, longest_days int, last_active_date date, timezone text);
```

Стрик считается по **локальной дате пользователя**, не по UTC — иначе в UTC+4 день обрывается в 4 утра.

---

## Notifications

```sql
notification_templates (
  id, code, channel, locale,       -- channel: email | inapp | push
  subject text, body text,
  provider_message_id text,        -- id письма у Resend, для трассировки доставки
  status text                      -- draft | pending_approval | approved
);

notifications (
  id, user_id, channel, template_code, locale,
  payload jsonb,
  status text,                     -- queued | scheduled | sent | delivered | read | failed
  scheduled_for timestamptz,       -- сдвиг из-за тихих часов / намаза
  provider_message_id text,
  sent_at, delivered_at, read_at, error,
  created_at
);
-- index (user_id, status, created_at desc), (status, scheduled_for)

notification_preferences (
  user_id, category,               -- course_updates | deadlines | marketing | social
  email boolean, inapp boolean,
  pk(user_id, category)
);

unsubscribe_tokens  (user_id, token_hash, category, created_at);
```

---

## Служебное

```sql
outbox (                           -- transactional outbox: событие пишется в одной
  id bigserial,                    -- транзакции с изменением данных
  aggregate_type text, aggregate_id uuid,
  event_type text, payload jsonb,
  created_at, processed_at, attempts smallint, error text
);
-- index (processed_at) where processed_at is null

job_failures  (id, job_name, payload jsonb, error text, attempts, created_at);
feature_flags (key pk, enabled boolean, rollout_percent smallint, conditions jsonb);
settings      (organization_id, key, value jsonb, pk(organization_id, key));
daily_stats   (date, course_id, locale, metric, value numeric, pk(date, course_id, locale, metric));
rate_limits   -- в Redis, не в Postgres
```

---

## Индексы, которые понадобятся сразу

```sql
-- горячий путь плеера
create index on lesson_progress (user_id, course_id);
create index on lessons (course_id, position) where status = 'published';

-- каталог
create index on courses using gin (search_tsv);
create index on courses (organization_id, status, visibility, published_at desc);

-- воркер сверки платежей — самый важный индекс в billing
create index on orders (status, last_checked_at) where status = 'pending';

-- outbox
create index on outbox (created_at) where processed_at is null;

-- аналитика
create index on learning_events (course_id, type, occurred_at);

-- защита от параллельных попыток квиза
create unique index on quiz_attempts (user_id, quiz_id) where status = 'in_progress';
```

---

## Правила миграций

Expand → migrate → contract, три отдельных релиза:

1. **Expand** — добавить новую колонку/таблицу, писать в обе, читать из старой.
2. **Migrate** — бэкфилл данных фоновой задачей, переключить чтение.
3. **Contract** — удалить старое, но **не раньше**, чем через релиз.

Удаление колонки в том же релизе, где перестали ей пользоваться, делает откод кода невозможным. На проде это выясняется в худший момент.

Для больших таблиц: `CREATE INDEX CONCURRENTLY`, `ALTER TABLE ... ADD COLUMN` без `DEFAULT` на volatile-выражении, бэкфилл батчами по 10k строк с паузой.
