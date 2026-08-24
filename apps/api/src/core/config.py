from functools import lru_cache
from urllib.parse import parse_qsl, urlencode

from pydantic import PrivateAttr, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Every managed Postgres hands out a URL the async driver cannot use directly.
# Coolify, Railway, Heroku and Neon all emit postgres://, psycopg tooling emits
# postgresql+psycopg2://, and pasting either one crash-loops the container on a
# dialect that does not exist. Normalising here is cheaper than a support ticket.
_ASYNC_SCHEME = {
    "postgres": "postgresql+asyncpg",
    "postgresql": "postgresql+asyncpg",
    "postgresql+psycopg": "postgresql+asyncpg",
    "postgresql+psycopg2": "postgresql+asyncpg",
    "postgresql+pg8000": "postgresql+asyncpg",
    "sqlite": "sqlite+aiosqlite",
}

# libpq spells it sslmode; asyncpg takes an ssl argument instead and raises a
# TypeError on the libpq name, so the parameter is translated rather than passed.
_SSL_REQUIRED = {"require", "verify-ca", "verify-full"}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    log_level: str = "info"
    app_url: str = "http://localhost:3000"

    # sqlite by default so the stack runs with zero infrastructure.
    # compose overrides this with postgresql+asyncpg://...
    database_url: str = "sqlite+aiosqlite:///./mada.db"

    jwt_secret: str = "dev-secret-change-me"
    jwt_access_ttl: int = 900
    jwt_refresh_ttl: int = 2_592_000

    default_locale: str = "ar"
    supported_locales: str = "ar,en"
    default_timezone: str = "Asia/Muscat"
    default_currency: str = "OMR"

    # Storage. Same code path for MinIO and Cloudflare R2 - only env changes.
    s3_endpoint: str = ""
    s3_region: str = "auto"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_force_path_style: bool = True
    signed_url_ttl: int = 14_400

    # Two buckets, because attaching a public custom domain to a bucket makes
    # every object in it readable by anyone who knows the key. Paid video and
    # submitted homework must never live in a bucket that has one.
    s3_bucket: str = "mada-media"          # private: video, documents, submissions
    s3_public_bucket: str = ""             # public: covers, avatars; falls back to s3_bucket
    s3_public_base_url: str = ""           # custom domain on the public bucket

    otp_ttl: int = 300
    otp_max_attempts: int = 5
    # Dev-only: return the code in the API response instead of relying on email.
    otp_echo_in_response: bool = True

    # Email is the only way in, so this is on the critical path for sign-in.
    resend_api_key: str = ""
    mail_from: str = "Mada <onboarding@resend.dev>"

    # Thawani. The integration is not written yet, so these exist to make the
    # app aware of whether it is configured, not to make payments work.
    thawani_base_url: str = ""
    thawani_secret_key: str = ""
    thawani_publishable_key: str = ""

    _database_ssl: bool = PrivateAttr(default=False)

    @model_validator(mode="after")
    def _normalise_database_url(self):
        """Make any managed Postgres URL usable by the async driver.

        Rebuilt by string surgery rather than urlunsplit, which collapses the
        three slashes of a sqlite path down to one and silently breaks the
        zero-infrastructure default.
        """
        raw = self.database_url
        scheme, separator, rest = raw.partition("://")
        if not separator:
            return self

        if "?" in rest:
            base, _, query = rest.partition("?")
            pairs = parse_qsl(query)
            self._database_ssl = any(
                key == "sslmode" and value in _SSL_REQUIRED for key, value in pairs
            )
            kept = [(k, v) for k, v in pairs if k != "sslmode"]
            rest = base + (f"?{urlencode(kept)}" if kept else "")

        object.__setattr__(
            self, "database_url", f"{_ASYNC_SCHEME.get(scheme, scheme)}://{rest}"
        )
        return self

    @model_validator(mode="after")
    def _refuse_sqlite_in_production(self):
        """SQLite is the zero-infrastructure default for local work.

        In production it is almost always a missing DATABASE_URL rather than a
        choice, and the failure is invisible: the app boots, writes to a file
        inside the container, and loses everything on the next deploy. Refusing
        to start turns silent data loss into an error at the top of the log.
        """
        if self.app_env == "production" and self.database_url.startswith("sqlite"):
            raise ValueError(
                "DATABASE_URL is missing or points at SQLite while APP_ENV=production. "
                "Set it to the Postgres resource, for example "
                "postgresql+asyncpg://user:password@host:5432/database"
            )
        return self

    @property
    def database_connect_args(self) -> dict:
        """asyncpg takes ssl, not libpq's sslmode, so the flag is translated."""
        if self._database_ssl and self.database_url.startswith("postgresql+asyncpg"):
            return {"ssl": True}
        return {}

    @property
    def locales(self) -> list[str]:
        return [x.strip() for x in self.supported_locales.split(",") if x.strip()]

    @property
    def storage_configured(self) -> bool:
        return bool(self.s3_access_key and self.s3_secret_key and self.s3_bucket)

    @property
    def payments_configured(self) -> bool:
        return bool(self.thawani_base_url and self.thawani_secret_key)

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def demo_checkout(self) -> bool:
        """Whether the simulated purchase path is allowed to run.

        It hands out course access without money changing hands, so it must be
        impossible anywhere that could be real: production, or any deployment
        that has payment credentials.
        """
        return not self.payments_configured and not self.is_production


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
