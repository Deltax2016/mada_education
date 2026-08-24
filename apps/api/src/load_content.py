"""Add any missing course to an existing catalogue.

Safe against production: it only creates what is absent and never updates or
deletes, so a course an author has edited is left alone.

    python -m src.load_content
"""

import asyncio
import logging
import sys

from .content_loader import ensure_catalogue
from .core.db import SessionLocal
from .core.logging import configure


async def main() -> int:
    configure()
    async with SessionLocal() as db:
        result = await ensure_catalogue(db)

    for slug in result["added"]:
        print(f"  added   {slug}")
    for slug in result["skipped"]:
        print(f"  present {slug}")
    print(f"\n  {len(result['added'])} added, {len(result['skipped'])} already there")
    return 0


if __name__ == "__main__":
    logging.getLogger().setLevel(logging.WARNING)
    raise SystemExit(asyncio.run(main()))
