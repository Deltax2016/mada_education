"""Outbound email through Resend.

Sign-in codes are the only transactional email that must not be delayed, so the
send is awaited and its failure is surfaced to the caller rather than swallowed.

Without an API key the service prints the message and reports success, which is
what lets the whole stack run locally with no third-party account.
"""

import logging

import httpx

from .config import settings

log = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"

SUBJECT = {
    "ar": "رمز الدخول إلى مدى",
    "en": "Your Mada sign-in code",
}

BODY = {
    "ar": {
        "dir": "rtl",
        "align": "right",
        "greeting": "رمز الدخول الخاص بك",
        "hint": "أدخل هذا الرمز في صفحة تسجيل الدخول.",
        "expiry": "الرمز صالح لخمس دقائق ويُستخدم مرة واحدة.",
        "ignore": "إذا لم تطلب هذا الرمز، تجاهل هذه الرسالة. لن يتغيّر شيء في حسابك.",
    },
    "en": {
        "dir": "ltr",
        "align": "left",
        "greeting": "Your sign-in code",
        "hint": "Enter this code on the sign-in page.",
        "expiry": "The code is valid for five minutes and works once.",
        "ignore": "If you did not ask for this code, ignore this email. Nothing about your account changes.",
    },
}


def _render(code: str, locale: str) -> str:
    t = BODY.get(locale, BODY["en"])
    # Email clients handle logical CSS properties badly, so this is the one place
    # in the project where physical directions are the correct choice.
    return f"""<!doctype html>
<html lang="{locale}" dir="{t['dir']}">
  <body style="margin:0;padding:32px 16px;background:#f4f5f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border:1px solid #dce3e1;">
      <tr><td style="padding:32px;text-align:{t['align']};">
        <p style="margin:0 0 8px;font-size:15px;color:#566c67;">{t['greeting']}</p>
        <p style="margin:0 0 20px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:#10201d;direction:ltr;">{code}</p>
        <p style="margin:0 0 6px;font-size:15px;line-height:1.7;color:#10201d;">{t['hint']}</p>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.7;color:#566c67;">{t['expiry']}</p>
        <p style="margin:0;padding-top:18px;border-top:1px solid #dce3e1;font-size:13px;line-height:1.7;color:#7c8f8a;">{t['ignore']}</p>
      </td></tr>
    </table>
  </body>
</html>"""


class EmailService:
    def __init__(self) -> None:
        self.enabled = bool(settings.resend_api_key)

    async def send_login_code(self, to: str, code: str, locale: str = "ar") -> bool:
        subject = SUBJECT.get(locale, SUBJECT["en"])
        html = _render(code, locale)

        if not self.enabled:
            # Development. The code is also returned by the API in this mode, so
            # the flow is testable without a Resend account.
            log.warning("email not configured, would send %r to %s", subject, to)
            return True

        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.post(
                RESEND_URL,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
                json={
                    "from": settings.mail_from,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
            )

        if response.status_code >= 400:
            # A fresh Resend account can only send to the address that owns it
            # until a sending domain is verified; that shows up here as a 403.
            log.error("resend rejected the message: %s %s", response.status_code, response.text)
            return False
        return True


email_service = EmailService()
