"""Checkout.

Two rules shape this module and both come from how Thawani actually behaves:

1. Amounts are integers in minor units. Thawani takes baisa, and OMR has three
   decimals, so any code that divides by 100 produces the wrong price.
2. The redirect back to `success_url` proves nothing. A tab gets closed, a
   connection drops, a URL gets faked. Only a server-side status read decides
   whether an order is paid, and a reconciliation pass catches everyone who
   never made it back to the site.
"""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from ..core.deps import DB, CurrentUser, Locale
from ..core.errors import Conflict, NotFound
from ..core.i18n import pick
from ..core.money import Money
from ..models import Course, Enrollment, Order

router = APIRouter(prefix="/billing", tags=["billing"])

# Rates live in data, not in code, because they change and differ by country.
TAX_RATES = {"OM": 0.05, "AE": 0.05, "SA": 0.15, "BH": 0.10, "QA": 0.0, "KW": 0.0}
ORDER_TTL_MINUTES = 30


class OrderIn(BaseModel):
    courseSlug: str
    country: str = "OM"


@router.post("/orders")
async def create_order(payload: OrderIn, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(Course).where(Course.slug == payload.courseSlug))
    course = result.scalar_one_or_none()
    if not course:
        raise NotFound("Course not found")

    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == user.id,
            Enrollment.course_id == course.id,
            Enrollment.status.in_(("active", "completed")),
        )
    )
    if existing.scalar_one_or_none():
        raise Conflict("order.already_enrolled", "You already have access to this course")

    country = (payload.country or user.country or "OM").upper()
    rate = TAX_RATES.get(country, 0.0)
    subtotal = course.price_minor
    # Rounded once at order level, not per line, and stored with the order so it
    # never gets recomputed later at a different rate.
    tax = round(subtotal * rate)
    total = subtotal + tax

    order = Order(
        user_id=user.id,
        course_id=course.id,
        subtotal_minor=subtotal,
        tax_minor=tax,
        total_minor=total,
        currency=course.currency,
        tax_rate=rate,
        tax_country=country,
        status="pending",
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=ORDER_TTL_MINUTES),
    )
    db.add(order)
    await db.commit()

    return {
        "orderId": order.id,
        "status": order.status,
        "courseTitle": pick(course.title, locale),
        "subtotal": Money(subtotal, order.currency).to_api(locale),
        "tax": Money(tax, order.currency).to_api(locale),
        "total": Money(total, order.currency).to_api(locale),
        "taxRate": rate,
        "taxCountry": country,
    }


@router.post("/orders/{order_id}/checkout")
async def checkout(order_id: str, db: DB, user: CurrentUser):
    """Creates the provider session and hands back a redirect URL.

    The Thawani call is stubbed here; the shape of the flow is what matters,
    because it is what makes the reconciliation pass possible.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise NotFound("Order not found")
    if order.status != "pending":
        raise Conflict("order.not_pending", f"Order is {order.status}")

    # Real call: POST {THAWANI_BASE_URL}/checkout/session with
    #   client_reference_id = order.id
    #   products[0].unit_amount = order.total_minor   (baisa, integer)
    # then redirect to https://checkout.thawani.om/pay/{session_id}?key={publishable}
    order.provider_session_id = f"dev_session_{order.id[:8]}"
    await db.commit()

    return {
        "provider": order.provider,
        "sessionId": order.provider_session_id,
        "redirectUrl": f"/checkout/simulate?order={order.id}",
    }


@router.get("/orders/{order_id}")
async def get_order(order_id: str, db: DB, user: CurrentUser, locale: Locale):
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise NotFound("Order not found")
    return {
        "orderId": order.id,
        "status": order.status,
        "total": Money(order.total_minor, order.currency).to_api(locale),
        "paidAt": order.paid_at.isoformat() if order.paid_at else None,
    }


@router.post("/orders/{order_id}/settle")
async def settle(order_id: str, db: DB, user: CurrentUser):
    """Stands in for the reconciliation worker.

    In production nothing calls this from the browser: a scheduled job polls the
    provider for every pending order older than a few minutes and settles it.
    The client only ever polls GET /orders/{id} and waits.
    """
    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order or order.user_id != user.id:
        raise NotFound("Order not found")

    order.check_attempts += 1
    order.last_checked_at = datetime.now(timezone.utc)

    if order.status == "paid":
        return {"status": "paid", "alreadySettled": True}

    order.status = "paid"
    order.paid_at = datetime.now(timezone.utc)

    existing = await db.execute(
        select(Enrollment).where(
            Enrollment.user_id == order.user_id, Enrollment.course_id == order.course_id
        )
    )
    if not existing.scalar_one_or_none():
        db.add(
            Enrollment(
                user_id=order.user_id,
                course_id=order.course_id,
                source="purchase",
                status="active",
            )
        )
        course_result = await db.execute(select(Course).where(Course.id == order.course_id))
        course = course_result.scalar_one()
        course.students_count += 1

    await db.commit()
    return {"status": "paid", "alreadySettled": False}
