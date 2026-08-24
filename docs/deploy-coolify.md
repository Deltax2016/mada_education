# Деплой: Docker Compose на Coolify

---

## 1. Где размещать

Отдельный вопрос, потому что аудитория в Заливе, а дешёвые VPS — в Европе.

| Вариант | Латентность до Маската | Комментарий |
|---|---|---|
| Hetzner (Германия/Финляндия) | ~100–140 мс | дёшево, надёжно; для API терпимо, статика и медиа закрываются CDN |
| VPS в ОАЭ (Дубай) | ~15–30 мс | дороже в 2–4 раза, выбор провайдеров скромнее |
| AWS `me-central-1` (ОАЭ) / `me-south-1` (Бахрейн) | ~10–25 мс | дорого, но есть, если понадобится |
| Локальный хостинг в Омане | минимальная | понадобится, если появятся требования к локализации данных |

**Рекомендация для старта:** Hetzner CPX41 (8 vCPU / 16 ГБ / 240 ГБ) + **Cloudflare перед всем**. У Cloudflare есть PoP в Маскате, Дубае, Дохе, Эр-Рияде, Джидде, Кувейте и Манаме — статика, изображения и видео отдаются локально, а до origin ходят только API-запросы.

Практически: 120 мс на API-вызов заметны, но не критичны; 120 мс на каждый сегмент видео — недопустимы. Поэтому CDN не откладывается «на потом».

Переезд ближе к региону остаётся открытым: всё в docker-compose, состояние — в Postgres и S3. Триггеры для переезда — жалобы на отзывчивость или требование локального хранения данных от корпоративного/государственного клиента (см. [security-compliance.md](security-compliance.md) §10).

**Железо:** 8 vCPU / 16 ГБ, если транскод видео на этой же машине; 4 vCPU / 8 ГБ — если транскода нет (v1) или он вынесен.

---

## 2. Окружения

| | Ветка | Домены |
|---|---|---|
| **staging** | `develop` | `staging.example.com`, `api.staging.example.com` |
| **production** | `main` | `example.com`, `api.example.com`, `cdn.example.com` |

Два независимых ресурса в Coolify, каждый со своим набором секретов и своей БД. Staging обязателен: на нём проверяются миграции, восстановление бэкапа и оплата в UAT Thawani.

---

## 3. Репозиторий

```
mada_education/
├── apps/
│   ├── web/                    Dockerfile, Next.js
│   └── api/                    Dockerfile, FastAPI + alembic + workers
├── packages/api-client/        сгенерированный TS-клиент
├── docker/
│   ├── compose.yaml            прод для Coolify
│   ├── compose.dev.yaml        локальная разработка
│   └── postgres/init.sql       extensions + ar_normalize()
├── docs/
├── .github/workflows/
│   ├── ci.yaml
│   └── release.yaml
├── .env.example
└── Makefile
```

---

## 4. compose.yaml

```yaml
x-api-env: &api-env
  APP_ENV: production
  DATABASE_URL: postgresql+asyncpg://mada:${SERVICE_PASSWORD_POSTGRES}@postgres:5432/mada
  REDIS_URL: redis://redis:6379/0
  JWT_SECRET: ${SERVICE_BASE64_64_JWT}
  DEFAULT_LOCALE: ar
  SUPPORTED_LOCALES: ar,en
  DEFAULT_TIMEZONE: Asia/Muscat
  WEEKEND_DAYS: "5,6"
  S3_ENDPOINT: ${S3_ENDPOINT}
  S3_BUCKET: ${S3_BUCKET}
  S3_ACCESS_KEY: ${S3_ACCESS_KEY}
  S3_SECRET_KEY: ${S3_SECRET_KEY}
  S3_PUBLIC_BASE_URL: ${CDN_URL}
  S3_FORCE_PATH_STYLE: ${S3_FORCE_PATH_STYLE:-false}
  THAWANI_BASE_URL: ${THAWANI_BASE_URL}
  THAWANI_SECRET_KEY: ${THAWANI_SECRET_KEY}
  THAWANI_PUBLISHABLE_KEY: ${THAWANI_PUBLISHABLE_KEY}
  WHATSAPP_TOKEN: ${WHATSAPP_TOKEN}
  WHATSAPP_PHONE_ID: ${WHATSAPP_PHONE_ID}
  SMS_PROVIDER_KEY: ${SMS_PROVIDER_KEY}
  SMTP_URL: ${SMTP_URL}
  SENTRY_DSN: ${SENTRY_DSN}
  LOG_LEVEL: info

services:
  web:
    image: ghcr.io/${GH_OWNER}/mada-web:${TAG:-latest}
    environment:
      - SERVICE_FQDN_WEB_3000
      - NODE_ENV=production
      - API_INTERNAL_URL=http://api:8000
      - NEXT_PUBLIC_APP_URL=${SERVICE_FQDN_WEB}
      - NEXT_PUBLIC_CDN_URL=${CDN_URL}
      - NEXT_PUBLIC_THAWANI_PUBLISHABLE_KEY=${THAWANI_PUBLISHABLE_KEY}
      - AUTH_COOKIE_DOMAIN=${COOKIE_DOMAIN}
    depends_on:
      api: { condition: service_healthy }
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1))"]
      interval: 15s
      timeout: 5s
      retries: 5
      start_period: 30s
    restart: unless-stopped

  api:
    image: ghcr.io/${GH_OWNER}/mada-api:${TAG:-latest}
    environment:
      <<: *api-env
      SERVICE_FQDN_API_8000: ""
      CORS_ORIGINS: ${SERVICE_FQDN_WEB}
    command: >
      sh -c "alembic upgrade head &&
             gunicorn src.main:app -k uvicorn.workers.UvicornWorker
             -w 4 -b 0.0.0.0:8000 --access-logfile - --timeout 60"
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    healthcheck:
      test: ["CMD","python","-c","import urllib.request;urllib.request.urlopen('http://localhost:8000/health/ready')"]
      interval: 15s
      timeout: 5s
      retries: 10
      start_period: 45s
    restart: unless-stopped

  worker:
    image: ghcr.io/${GH_OWNER}/mada-api:${TAG:-latest}
    command: arq src.workers.main.WorkerSettings
    environment: *api-env
    depends_on:
      postgres: { condition: service_healthy }
      redis:    { condition: service_healthy }
    deploy:
      resources:
        limits: { cpus: '2.0', memory: 3G }   # ffmpeg иначе съест все ядра
    restart: unless-stopped

  scheduler:
    image: ghcr.io/${GH_OWNER}/mada-api:${TAG:-latest}
    command: arq src.workers.scheduler.SchedulerSettings
    environment: *api-env
    depends_on:
      redis: { condition: service_healthy }
    restart: unless-stopped

  postgres:
    image: pgvector/pgvector:pg17
    environment:
      POSTGRES_USER: mada
      POSTGRES_PASSWORD: ${SERVICE_PASSWORD_POSTGRES}
      POSTGRES_DB: mada
      POSTGRES_INITDB_ARGS: "--locale-provider=icu --icu-locale=ar-OM"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./postgres/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    command: >
      postgres -c max_connections=200 -c shared_buffers=2GB
               -c effective_cache_size=6GB -c work_mem=16MB
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mada"]
      interval: 10s
      retries: 10
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes --maxmemory 1gb --maxmemory-policy allkeys-lru
    volumes: [redisdata:/data]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      retries: 5
    restart: unless-stopped

  # только dev/staging — в проде заменяется на R2 сменой env
  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    environment:
      - SERVICE_FQDN_MINIO_9000
      - MINIO_ROOT_USER=${S3_ACCESS_KEY}
      - MINIO_ROOT_PASSWORD=${S3_SECRET_KEY}
    volumes: [miniodata:/data]
    restart: unless-stopped

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### Что здесь существенно

- **Magic-переменные Coolify.** `SERVICE_FQDN_<SERVICE>_<PORT>` — Coolify выдаёт домен и генерирует Traefik-лейблы. `SERVICE_PASSWORD_*` и `SERVICE_BASE64_64_*` — генерируются и хранятся Coolify, их не надо придумывать и класть в репозиторий.
- **`depends_on` с `condition: service_healthy`** обязателен — иначе api стартует раньше Postgres и уходит в рестарт-петлю, а Coolify показывает деплой «успешным».
- **Миграции в `command` api.** При нескольких репликах вынести в отдельный one-shot сервис: Alembic берёт advisory lock, но проверять это на проде не стоит.
- **Лимит CPU на worker — не опциональная оптимизация.** Без него первый же транскод роняет отзывчивость API.
- **ICU-локаль `ar-OM`** на кластере — чтобы `COLLATE "ar-x-icu"` работал для сортировки арабских строк.
- **Nginx не нужен** — Traefik поднимает Coolify.
- **Coolify собирает stdout контейнеров** — отдельный лог-стек на одном VPS не окупается.

### `postgres/init.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;
-- ar_normalize() — см. i18n-rtl.md §6
```

---

## 5. Dockerfile

**web** — multi-stage, `output: "standalone"` в `next.config.ts`:
```
deps    → pnpm install --frozen-lockfile
builder → pnpm build (переменные сборки как build args)
runner  → node:22-alpine, non-root, только .next/standalone + static + шрифты
```
Итог ~180 МБ. Арабские шрифты кладутся в образ, а не тянутся с внешнего CDN — CSP это запрещает, да и надёжнее.

**api** — `python:3.13-slim`, зависимости через `uv`. В финальный слой обязательно:
```
ffmpeg                      транскод и ffprobe
libpango, libharfbuzz       WeasyPrint: shaping арабского в PDF
fonts-noto-core, fonts-noto-arabic   иначе PDF будет из «квадратиков»
```
Один образ на `api`/`worker`/`scheduler` — различаются только `command`.

**Забытые арабские шрифты в образе воркера — классический баг, который проявляется только на проде**, когда первый студент получает сертификат с прямоугольниками вместо имени. Проверять в CI: генерировать тестовый PDF и сравнивать с эталоном.

---

## 6. CI/CD

Сборка **не на VPS**. Coolify умеет билдить из git, но сборка Next.js съедает 3–4 ГБ RAM и кладёт прод.

```
GitHub Actions (push в develop / main)
  ├─ lint: ruff, mypy, eslint, tsc
  ├─ tests: pytest (testcontainers Postgres), vitest
  ├─ i18n-check: ключи ar/en совпадают, plural-формы для ar полные
  ├─ contract-check: сгенерированный api-client == закоммиченному
  ├─ e2e: playwright ×2 (ar/rtl и en/ltr) на docker-compose
  ├─ pdf-check: тестовый сертификат рендерится с арабским корректно
  ├─ build: docker buildx, кэш GHA → ghcr.io :sha и :latest
  └─ deploy: POST на Coolify webhook с ?tag=<sha>

Coolify: docker compose pull && up -d → healthcheck → зелёный
```

Откат = передеплой предыдущего тега. Хранить минимум 10 тегов.

**Миграции обратно совместимы всегда** (expand → migrate → contract). Удаление колонки в том же релизе, где перестали ей пользоваться, делает откат невозможным — выясняется в худший момент.

---

## 7. Env

`.env.example` в репозитории со всеми ключами и без значений. Реальные — только в Coolify UI.

```env
APP_ENV=production
APP_URL=https://example.com
API_URL=https://api.example.com
COOKIE_DOMAIN=.example.com

DEFAULT_LOCALE=ar
SUPPORTED_LOCALES=ar,en
DEFAULT_TIMEZONE=Asia/Muscat
WEEKEND_DAYS=5,6
DEFAULT_CURRENCY=OMR

DATABASE_URL=
REDIS_URL=

JWT_SECRET=
JWT_ACCESS_TTL=900
JWT_REFRESH_TTL=2592000
OTP_TTL=300
OTP_MAX_ATTEMPTS=5

# storage: единственное, что меняется при MinIO → R2
S3_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com
S3_REGION=auto
S3_BUCKET=mada-media
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_PUBLIC_BASE_URL=https://cdn.example.com
S3_FORCE_PATH_STYLE=false
SIGNED_URL_TTL=14400

MEDIA_PROVIDER=s3
FFMPEG_ENABLED=true
MAX_CONCURRENT_PLAYBACK_SESSIONS=3

PAYMENT_PROVIDER_DEFAULT=thawani
THAWANI_BASE_URL=https://checkout.thawani.om/api/v1
THAWANI_SECRET_KEY=
THAWANI_PUBLISHABLE_KEY=
ORDER_EXPIRY_MINUTES=30
RECONCILE_INTERVAL_SECONDS=300

WHATSAPP_TOKEN=
WHATSAPP_PHONE_ID=
SMS_PROVIDER=unifonic
SMS_PROVIDER_KEY=
SMS_SENDER_ID=
SMTP_URL=
MAIL_FROM=noreply@example.com
QUIET_HOURS=22:00-08:00
RESPECT_PRAYER_TIMES=true

SENTRY_DSN=
LOG_LEVEL=info
```

---

## 8. MinIO → Cloudflare R2

1. Создать бакет R2, выдать токен с правами Object Read & Write.
2. Публичные ассеты (обложки, аватары, промо) — custom domain `cdn.example.com` на бакет.
3. Приватный контент (видео курсов, домашние задания) — **только presigned URL**, публичного доступа нет.
4. Перелить объекты: `rclone sync minio:mada-media r2:mada-media --transfers 16 --checkers 32`.
5. Поменять пять переменных (`S3_ENDPOINT`, ключи, `S3_FORCE_PATH_STYLE=false`, `S3_PUBLIC_BASE_URL`), передеплоить, удалить сервис `minio`.
6. `storage_key` в БД не меняются — код не трогается вообще.

Почему R2, а не S3: нулевая плата за исходящий трафик. Для видеоплатформы это основная статья расходов, и она обнуляется.

Опционально — Cloudflare Worker перед бакетом, проверяющий короткий подписанный токен: даёт проверку Referer, лимит по IP и возможность отзыва ссылки, чего presign сам по себе не умеет.

---

## 9. Бэкапы

| Что | Как | Частота | Хранение |
|---|---|---|---|
| Postgres | планировщик бэкапов Coolify → R2 (отдельный бакет) | ежедневно 02:00 GST | 30 дней |
| Медиа | версионирование объектов R2 + репликация в бэкап-бакет | непрерывно | 90 дней |
| Секреты | ручной экспорт из Coolify в менеджер паролей | при каждом изменении | — |

**Раз в месяц — восстановление на staging из свежего бэкапа.** Непроверенный бэкап не считается бэкапом; это единственная процедура из списка, которую регулярно пропускают и о которой регулярно жалеют.

---

## 10. Мониторинг

- **Sentry** — ошибки фронта и бэка, релизы по git sha, алерты в мессенджер.
- **Uptime Kuma** — отдельным контейнером: `/health/ready`, главная, `api`, страница оплаты.
- **Бизнес-алерты** отдельным каналом:
  - заказ в `pending` дольше 30 минут при `check_attempts > 10`;
  - очередь ARQ длиннее 100 задач;
  - транскод в `processing` дольше 2 часов;
  - доля 5xx выше 1 % за 5 минут;
  - неотправленные уведомления в `failed` больше 10 за час;
  - свободное место на диске < 20 %.

Prometheus/Grafana не разворачивать, пока алертов из Sentry и Uptime Kuma хватает: на одном VPS стек метрик съедает больше, чем даёт.

---

## 11. Локальная разработка

`compose.dev.yaml` поднимает только инфраструктуру: postgres, redis, minio, mailpit. `web` и `api` запускаются на хосте с hot-reload — это быстрее, чем всё в Docker.

```bash
make up        # инфраструктура
make migrate   # alembic upgrade head
make seed      # демо-данные
make dev       # web + api параллельно
make gen       # OpenAPI → TS-клиент
make test      # pytest + vitest
make e2e       # playwright ×2 направления
```

**Seed-данные обязательны с первой недели** и должны включать:
- курс на `ar` и `en`, включая урок, где английская версия отсутствует (проверка fallback);
- уроки со всеми типами блоков;
- квиз со всеми типами вопросов, в том числе арабский `short_text` с хамзой и огласовками;
- поток с drip-расписанием, учитывающим выходные пт–сб;
- продукт в OMR с ценой, где важен третий знак (например, 12.500);
- пользователей: студент, преподаватель, куратор, админ;
- завершённый курс с выданным сертификатом.

Это экономит часы при разработке каждой следующей фичи и ловит регионально-специфичные баги до прода.
