"""Storage service over the S3 API.

MinIO in development and Cloudflare R2 in production are the same code path:
only the endpoint, keys and path-style flag change. Object keys stored in the
database never change, so the migration is an env swap, not a data migration.

When no credentials are configured the service degrades to serving files from a
local directory, so the project runs end to end with zero infrastructure.
"""

import mimetypes
from pathlib import Path

from .config import settings

LOCAL_ROOT = Path(__file__).resolve().parents[2] / "storage"


class StorageService:
    def __init__(self) -> None:
        self._client = None
        self.local = not settings.storage_configured
        if self.local:
            LOCAL_ROOT.mkdir(parents=True, exist_ok=True)

    @property
    def client(self):
        if self._client is None:
            import boto3
            from botocore.client import Config

            self._client = boto3.client(
                "s3",
                endpoint_url=settings.s3_endpoint or None,
                region_name=settings.s3_region,
                aws_access_key_id=settings.s3_access_key,
                aws_secret_access_key=settings.s3_secret_key,
                config=Config(
                    signature_version="s3v4",
                    s3={
                        "addressing_style": "path"
                        if settings.s3_force_path_style
                        else "virtual"
                    },
                ),
            )
        return self._client

    def presign_put(self, key: str, content_type: str | None = None) -> dict:
        if self.local:
            return {"url": f"/api/v1/media/local-upload/{key}", "method": "PUT", "local": True}
        params = {"Bucket": settings.s3_bucket, "Key": key}
        if content_type:
            params["ContentType"] = content_type
        url = self.client.generate_presigned_url("put_object", Params=params, ExpiresIn=3600)
        return {"url": url, "method": "PUT", "local": False}

    def presign_get(self, key: str, ttl: int | None = None) -> str:
        """Short-lived playback URL. Paid media never has a stable public URL."""
        if key.startswith("http://") or key.startswith("https://"):
            # Seed and demo assets that already live somewhere else.
            return key
        if self.local:
            return f"/api/v1/media/local/{key}"
        return self.client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.s3_bucket, "Key": key},
            ExpiresIn=ttl or settings.signed_url_ttl,
        )

    def public_url(self, key: str) -> str:
        """Only for assets that are genuinely public: covers, avatars, promos."""
        if key.startswith("http://") or key.startswith("https://"):
            return key
        if settings.s3_public_base_url:
            return f"{settings.s3_public_base_url.rstrip('/')}/{key}"
        return self.presign_get(key)

    def write_local(self, key: str, data: bytes) -> None:
        path = LOCAL_ROOT / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def read_local(self, key: str) -> tuple[bytes, str]:
        path = LOCAL_ROOT / key
        if not path.exists():
            raise FileNotFoundError(key)
        mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        return path.read_bytes(), mime


storage = StorageService()
