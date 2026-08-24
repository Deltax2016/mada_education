# Mada Education — техническая документация

Платформа онлайн-обучения. Основной рынок — **Оман и страны Залива**, основной язык интерфейса и контента — **арабский**, второй — **английский**.

## Зафиксированные решения

| | |
|---|---|
| Frontend | Next.js 15 (App Router) + TypeScript |
| Backend | Python 3.13 + FastAPI |
| БД | PostgreSQL 17 (pgvector, pg_trgm, unaccent) |
| Очереди/кэш | Redis 7 + ARQ |
| Хранилище | S3 API: MinIO (dev) → Cloudflare R2 (prod) |
| Деплой | Docker Compose на Coolify |
| Платежи | **Thawani** (Оман) + мультипровайдерная абстракция для Залива |
| Локали | `ar` (default, RTL) + `en` (LTR) |

## Документы

| Документ | О чём |
|---|---|
| [architecture.md](architecture.md) | Общая архитектура, модули, топология, принципы |
| [i18n-rtl.md](i18n-rtl.md) | Арабский и RTL: локализация, типографика, поиск, календари |
| [data-model.md](data-model.md) | Схема БД по всем модулям |
| [api-design.md](api-design.md) | Конвенции API, ошибки, пагинация, список эндпоинтов |
| [frontend.md](frontend.md) | Структура фронта, роутинг, состояние, дизайн-система |
| [media-video.md](media-video.md) | Загрузка, транскод, плеер, субтитры, защита контента |
| [quiz-engine.md](quiz-engine.md) | Движок квизов: типы вопросов, грейдинг, античит, аналитика |
| [billing-gulf.md](billing-gulf.md) | Thawani, платежи Залива, валюты, НДС, чеки |
| [security-compliance.md](security-compliance.md) | Безопасность, PDPL Омана и КСА, данные пользователей |
| [deploy-coolify.md](deploy-coolify.md) | CI/CD, окружения, бэкапы, регион хостинга |
| [../DEPLOY.md](../DEPLOY.md) | Пошаговый деплой на Coolify: база отдельным ресурсом |
| [roadmap.md](roadmap.md) | План по фазам с оценками и рисками |

## Код

Работающая реализация лежит в `apps/`. Как запустить и что важно знать перед
правкой кода: [../README.md](../README.md).

## Порядок чтения

Первый раз: `architecture.md` → `i18n-rtl.md` → `data-model.md` → `roadmap.md`.
Остальное — справочники по мере работы над конкретным модулем.
