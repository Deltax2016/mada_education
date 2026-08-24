# Deploying to Coolify

The stack is two containers, `web` and `api`. Postgres lives outside the stack.

## 1. Create the database first

In Coolify: **New Resource → Database → PostgreSQL** (16 or 17).

Keeping it out of the application compose means redeploying, rolling back or
rebuilding the app never touches the data, and Coolify's scheduled backups can
see it. A Postgres inside the app compose is one bad `docker compose down -v`
away from being gone.

Paste the internal connection string it gives you into `DATABASE_URL` as is.
`postgres://`, `postgresql://` and `postgresql+psycopg2://` are all rewritten to
the async driver on startup, and libpq's `sslmode` parameter is translated into
what asyncpg expects.

Use the internal host Coolify shows, not the public one.

If `DATABASE_URL` is missing while `APP_ENV=production`, the API refuses to
start rather than falling back to SQLite. That fallback is fine locally and
disastrous in production: the app would boot, write to a file inside the
container, and lose everything on the next deploy.

Enable **Scheduled Backups** on the database resource and point them at S3 or R2.

## 2. Create the application

**New Resource → Docker Compose**, point it at this repository, compose file
`docker-compose.yaml`.

Set a domain on the `web` service and one on `api`. Coolify writes the Traefik
labels and issues certificates from the `SERVICE_FQDN_*` variables already in the
file.

## 3. Environment variables

Required for the app to start at all:

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | from step 1, with `+asyncpg` |
| `RESEND_API_KEY` | sign-in is an emailed code, so without this nobody can log in |
| `MAIL_FROM` | must be on a domain verified in Resend, format `Name <address@domain>` |

### Sender address

Resend takes the `from` field verbatim, so `MAIL_FROM` is a full mailbox with a
display name:

```
MAIL_FROM=Mada <no-reply@send.mada-tech.space>
```

Verify a **subdomain** rather than the root domain. Sign-in codes are the one
message that must always arrive, and putting them on their own subdomain keeps
their sending reputation separate from anything marketing sends from
`mada-tech.space` later. Resend shows the exact DNS records to add: an MX record
for bounce handling, a TXT record for SPF, and a TXT record for DKIM. Add a
DMARC record too before real traffic.

Until verification passes, leave it on `Mada <onboarding@resend.dev>`, which only
delivers to the address that owns the Resend account.

Note the angle brackets: paste this into the Coolify UI as is, but never `source`
an env file containing it in a shell, where `<` is a redirect.

Required before selling anything:

| Variable | Notes |
| --- | --- |
| `THAWANI_BASE_URL` | UAT while testing, production after onboarding |
| `THAWANI_SECRET_KEY` | server side only |
| `THAWANI_PUBLISHABLE_KEY` | this one is meant to reach the browser |

## 4. Storage: two buckets, not one

Create **two** R2 buckets:

| Bucket | Holds | Public domain |
| --- | --- | --- |
| `mada-media` | video, documents, submitted homework | **never** |
| `mada-public` | course covers, avatars | `cdn.mada-tech.space` |

This split is not tidiness. Attaching a custom domain to an R2 bucket makes every
object in that bucket readable by anyone who knows the key, and knowing the key
is not hard once a learner has legitimately watched one lesson. Paid video cannot
live in a bucket that has a public domain, or the signed URLs in front of it are
decoration.

`make storage-check` refuses to pass if `S3_PUBLIC_BASE_URL` is set while only one
bucket is configured.

### Getting the values

The endpoint and both keys come from **R2 → Manage API Tokens → Create token**,
with **Object Read & Write** and the token scoped to these two buckets:

| Cloudflare calls it | Set it as |
| --- | --- |
| Access Key ID | `S3_ACCESS_KEY` |
| Secret Access Key | `S3_SECRET_KEY` |
| the endpoint shown next to the keys | `S3_ENDPOINT` |

The endpoint is `https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, where the account
id is the 32 character hex string in your dashboard URL. It contains no bucket
name. Buckets created under EU jurisdiction use
`https://<ACCOUNT_ID>.eu.r2.cloudflarestorage.com` instead.

### Connecting the public domain

On the **public** bucket only: **Settings → Public access → Custom Domains →
Connect Domain**, enter `cdn.mada-tech.space`. The zone has to already be in the
same Cloudflare account; Cloudflare then writes the CNAME and issues the
certificate itself. Wait for it to read Active.

The `r2.dev` address Cloudflare offers instead is rate limited and documented as
not for production. It is fine for a first look, not for launch.

| Variable | Value |
| --- | --- |
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_BUCKET` | `mada-media`, the private one |
| `S3_PUBLIC_BUCKET` | `mada-public` |
| `S3_ACCESS_KEY`, `S3_SECRET_KEY` | from the R2 API token |
| `S3_PUBLIC_BASE_URL`, `CDN_URL` | `https://cdn.mada-tech.space` |
| `S3_FORCE_PATH_STYLE` | `false` for R2, `true` for MinIO |

Verify before trusting it:

```bash
make storage-check
```

It writes an object, reads it back, signs a URL and deletes it, and names which
value is wrong when something fails.

`SERVICE_BASE64_64_JWT` is generated by Coolify. Do not set it by hand, and do
not change it later: rotating it signs every user out.

## 5. Schema

The API creates its tables on first start. That is enough to get the first deploy
up, but it does not migrate an existing schema, so before the first real users
arrive this needs Alembic. Until then, treat a schema change as requiring a fresh
database.

## 6. What the app reports about itself

```bash
curl https://api.<your-domain>/health/ready
```

```json
{
  "status": "ok",
  "env": "production",
  "storage": "s3",
  "email": "resend",
  "payments": "disabled",
  "loginCodeEcho": false
}
```

This reads what is actually wired, not what is present in the environment:

| Field | What it means |
| --- | --- |
| `storage: local` | S3 credentials are missing, media is being written to the container filesystem and will vanish on redeploy |
| `email: console` | `RESEND_API_KEY` is missing, so sign-in codes are only logged and nobody can log in |
| `payments: disabled` | production with no Thawani credentials, purchases refuse cleanly |
| `payments: unimplemented` | Thawani credentials are set but the provider call is not written yet, so checkout returns 501 |
| `payments: demo` | non-production with no credentials, checkout grants access without charging |
| `loginCodeEcho: true` | the sign-in code is being returned in the HTTP response. Never acceptable in production |

## 7. Logs

Both containers write one JSON line per request to stdout, which is what Coolify
collects:

```json
{"ts":"...","level":"info","logger":"request","msg":"GET /ar/courses 200",
 "method":"GET","path":"/ar/courses","status":200,"durationMs":22.5,
 "requestId":"499cf081-334b-46"}
```

The `requestId` is generated by the web container and passed to the API, so one
browser action reads as one chain across both services. Health checks are not
logged; at one every fifteen seconds they would bury everything else. Query
strings are never logged, because sign-in codes and signed media URLs live there.

`LOG_LEVEL` defaults to `info`. Set it to `warning` to see only problems.

## 8. Verify

```bash
curl https://api.<your-domain>/health/ready
```

Should return `{"status":"ok", ...}`. If it returns 503 the database is
unreachable, which almost always means the scheme in `DATABASE_URL` is missing
`+asyncpg` or the host is the public address instead of the internal one.

## What is deliberately not in the compose

- **Postgres** lives outside, see above.
- **Redis** is not there because nothing uses it yet. It becomes necessary with
  the background worker (transcoding, emails, payment reconciliation); add a
  Coolify Redis resource and a `REDIS_URL` at that point.
- **MinIO** is a local development convenience only. Production uses R2 through
  the same S3 API, which is why there is no separate code path.
