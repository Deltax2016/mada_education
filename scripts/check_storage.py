#!/usr/bin/env python3
"""Prove the storage credentials work before the app needs them.

Does a real round trip: writes a small object, reads it back, signs a URL for it
and deletes it. Every failure mode of a misfilled R2 config looks different at
this level, so the script names which value is wrong instead of reporting a
generic error at upload time.

    make storage-check
"""

import os
import sys
import uuid

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "api"))

from src.core.config import settings  # noqa: E402


def main() -> int:
    print(f"  endpoint : {settings.s3_endpoint or '(empty, falling back to local disk)'}")
    print(f"  private  : {settings.s3_bucket}")
    print(f"  public   : {settings.s3_public_bucket or '(none, public assets stay in the private bucket)'}")
    print(f"  region   : {settings.s3_region}")
    print(f"  key id   : {settings.s3_access_key[:6] + '...' if settings.s3_access_key else '(empty)'}")
    print(f"  path style: {settings.s3_force_path_style}")
    print()

    if settings.s3_public_base_url and not settings.s3_public_bucket:
        print("  FAIL S3_PUBLIC_BASE_URL points a public domain at a deployment that has")
        print("       only one bucket. A custom domain makes every object in its bucket")
        print("       readable by anyone holding the key, and this bucket also holds paid")
        print("       video and submitted homework.")
        print("       Create a second bucket for public assets, attach the domain to that")
        print("       one, and set S3_PUBLIC_BUCKET to its name.")
        return 1

    if settings.s3_public_bucket and settings.s3_public_bucket == settings.s3_bucket:
        print("  FAIL S3_PUBLIC_BUCKET and S3_BUCKET are the same bucket, which defeats")
        print("       the split: the public domain would expose the private objects too.")
        return 1

    if not settings.storage_configured:
        print("  storage is not configured, so the API serves media from local disk.")
        print("  That is fine for development. Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY")
        print("  and S3_SECRET_KEY to talk to R2.")
        return 0

    import boto3
    from botocore.client import Config
    from botocore.exceptions import ClientError, EndpointConnectionError

    client = boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint or None,
        region_name=settings.s3_region,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "path" if settings.s3_force_path_style else "virtual"},
        ),
    )

    key = f"_healthcheck/{uuid.uuid4().hex}.txt"
    payload = b"mada storage check"

    try:
        client.put_object(Bucket=settings.s3_bucket, Key=key, Body=payload)
        print("  ok   wrote an object")
    except EndpointConnectionError:
        print("  FAIL could not reach the endpoint.")
        print("       S3_ENDPOINT is wrong or unreachable. For R2 it is")
        print("       https://<ACCOUNT_ID>.r2.cloudflarestorage.com and the account id")
        print("       is the 32 character hex string in your Cloudflare dashboard URL.")
        return 1
    except Exception as error:  # noqa: BLE001 - the point is to name the cause
        if not isinstance(error, ClientError):
            print(f"  FAIL could not talk to the endpoint: {type(error).__name__}")
            print(f"       {str(error)[:140]}")
            print("       Check S3_ENDPOINT. For R2 it is exactly")
            print("       https://<ACCOUNT_ID>.r2.cloudflarestorage.com with no bucket in it.")
            return 1
        code = error.response.get("Error", {}).get("Code", "")
        if code in ("InvalidAccessKeyId", "SignatureDoesNotMatch", "AccessDenied"):
            print(f"  FAIL the credentials were rejected ({code}).")
            print("       S3_ACCESS_KEY is the R2 Access Key ID and S3_SECRET_KEY is the")
            print("       R2 Secret Access Key. The token also needs Object Read & Write,")
            print("       and it must cover this bucket.")
        elif code in ("NoSuchBucket", "404"):
            print(f"  FAIL the bucket {settings.s3_bucket!r} does not exist in this account.")
            print("       S3_BUCKET must match the name exactly, and the bucket has to be")
            print("       created in Cloudflare before the app can use it.")
        else:
            print(f"  FAIL {code}: {error}")
        return 1

    body = client.get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()
    print("  ok   read it back" if body == payload else "  FAIL read back different bytes")

    url = client.generate_presigned_url(
        "get_object", Params={"Bucket": settings.s3_bucket, "Key": key}, ExpiresIn=60
    )
    print(f"  ok   signed a url ({url.split('?')[0][:56]}...)")

    client.delete_object(Bucket=settings.s3_bucket, Key=key)
    print("  ok   cleaned up")

    if settings.s3_public_base_url:
        print(f"\n  public assets are served from {settings.s3_public_base_url}")
        print(f"  backed by the {settings.s3_public_bucket!r} bucket. The private bucket")
        print("  has no public domain, so video and homework are reachable only through")
        print("  short lived signed urls.")
    else:
        print("\n  note S3_PUBLIC_BASE_URL is empty, so covers and avatars are served")
        print("       through signed urls as well. That works, it just gives up CDN")
        print("       caching on images that are meant to be public.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
