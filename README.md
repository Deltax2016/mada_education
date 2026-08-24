# Mada Education

Bilingual course platform for the Omani and Gulf market. Arabic first, English
second, prices in Omani rials, sign-in by emailed code through Resend, payment
through Thawani.

Architecture and reasoning live in [docs/](docs/README.md). This file is how to
run it.

## Run it

Nothing needs to be installed beyond Node, Python and uv: the API defaults to
SQLite and to local disk for media, so the whole stack starts with no
infrastructure.

```bash
make setup    # dependencies for both apps
make seed     # reset the database and load the demo course
make dev      # api on :8010, web on :3000
```

Open http://localhost:3000/ar. Switch to English from the header.

Sign in with any address: entering a code creates the account on first use. The
code is echoed on screen in development, so no Resend account is needed to try
the flow. Two addresses come seeded with data:

| Address | What it has |
| --- | --- |
| `student@mada.example` | already owns the VAT course |
| `admin@mada.example` | can upload media |

To send real email, set `RESEND_API_KEY`. Note that a fresh Resend account can
only deliver to the address that owns it until a sending domain is verified.

To run against Postgres, MinIO and Mailpit instead:

```bash
make up
DATABASE_URL=postgresql+asyncpg://mada:mada@localhost:5432/mada make seed
```

## Two sides

**Learners** browse the catalogue without an account, but opening any lesson
requires signing in. `/[locale]/dashboard` is their side: what they are in the
middle of, everything they own, and their certificates.

**Authors** go to `/[locale]/teach`. Filling in an instructor profile grants the
role immediately, with no approval queue. From there: create a course, build the
curriculum, write each lesson in Arabic and English, and publish. Publishing is
the real gate, and it refuses a course with no lessons or with lessons that have
no content, naming which ones.

A course is only editable by the person who created it. Every author route
resolves the course through one ownership check, and a course belonging to
someone else answers "not found" rather than "forbidden", so the endpoint cannot
be used to discover which slugs exist.

## Check it

```bash
./scripts/smoke.sh
```

Covers the things that are easy to break without noticing: the paywall, the
locale fallback, three-decimal money, and Arabic answer grading.

## Layout

```
apps/api              FastAPI, SQLAlchemy, seed data
apps/api/src/content  authored course material, consumed by the seed
apps/web              Next.js 15 App Router, Tailwind v4
docker-compose.yaml   deploy target for Coolify, see DEPLOY.md
docker/               local infrastructure only
docs/                 architecture, data model, roadmap
scripts/              smoke test, course content extractor
```

Deployment is in [DEPLOY.md](DEPLOY.md). The database is deliberately not part of
the application compose.

## Things worth knowing before changing code

**Money is an integer in minor units plus a currency code.** OMR has three
decimals, not two, and Thawani takes amounts in baisa. Anything that divides by
100 produces the wrong price. See `apps/api/src/core/money.py`.

**RTL uses logical CSS properties only.** `ms-`, `me-`, `ps-`, `pe-`,
`text-start`, `border-s`. Physical directions look right in English and wrong in
Arabic. The exception is the media control bar, which stays left to right
because a video timeline does.

**Arabic text is normalised before comparison.** Diacritics, alef variants and
ta marbuta are folded, so an answer typed the way people actually type it is
graded correctly and search finds it. See `ar_normalize`.

**Correct answers never leave the server during an attempt.** The in-attempt
payload is built by a function with no access to `is_correct`, rather than by
stripping a field and hoping nobody forgets.

**Access is decided in one place.** `apps/api/src/core/access.py` is the only
thing that answers "can this person open this lesson". Reimplementing part of it
somewhere else is how paid content leaks.

**Storage is the S3 API.** MinIO locally, Cloudflare R2 in production. Object
keys never change, so the move is an environment change, not a migration.

**There are no passwords.** Email plus a one-time code is the only way in, so
there is nothing to reset, rotate or leak. The code request answers identically
whether or not the address is registered, so it cannot be used to find out who
has an account.
