from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
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

    @property
    def locales(self) -> list[str]:
        return [x.strip() for x in self.supported_locales.split(",") if x.strip()]

    @property
    def storage_configured(self) -> bool:
        return bool(self.s3_access_key and self.s3_secret_key and self.s3_bucket)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
