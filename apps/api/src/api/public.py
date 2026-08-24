"""Public endpoints. No authentication, and deliberately minimal output."""

from fastapi import APIRouter
from sqlalchemy import select

from ..core.deps import DB, Locale
from ..core.errors import NotFound
from ..core.i18n import pick
from ..models import Certificate, Course

router = APIRouter(prefix="/public", tags=["public"])


@router.get("/verify/{serial}")
async def verify_certificate(serial: str, db: DB, locale: Locale):
    """Anyone with the serial can check a certificate.

    The page is public and indexable, so it returns the holder's name, the
    course and the date, and nothing else: no email address, no per-lesson
    results.
    """
    result = await db.execute(
        select(Certificate, Course)
        .join(Course, Course.id == Certificate.course_id)
        .where(Certificate.serial_number == serial.strip().upper())
    )
    row = result.first()
    if not row:
        raise NotFound("Certificate not found")

    certificate, course = row
    return {
        "serial": certificate.serial_number,
        "valid": certificate.revoked_at is None,
        "nameAr": certificate.name_ar,
        "nameEn": certificate.name_en,
        "courseTitle": pick(course.title, locale),
        "courseSlug": course.slug,
        "issuedAt": certificate.issued_at.isoformat(),
        "scorePercent": certificate.score_percent,
    }
