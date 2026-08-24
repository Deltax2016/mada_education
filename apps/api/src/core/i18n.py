"""Locale resolution and Arabic text normalisation."""

import re

from .config import settings

FALLBACK_CHAIN = ["en", "ar"]

_TATWEEL = "ـ"
_HARAKAT = re.compile(r"[ً-ْٰـ]")
_INVISIBLE = re.compile(r"[​-‏؜]")
_TRANSLATE = str.maketrans(
    {
        "أ": "ا", "إ": "ا", "آ": "ا", "ٱ": "ا",
        "ى": "ي", "ئ": "ي",
        "ة": "ه",
        "ؤ": "و",
        "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
        "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
    }
)


def ar_normalize(text: str) -> str:
    """Fold the Arabic variants users never type consistently.

    Without this, an answer typed with a hamza is graded wrong against an answer
    key written without one, and search misses the majority of real queries.
    """
    if not text:
        return ""
    text = _INVISIBLE.sub("", text)
    text = _HARAKAT.sub("", text)
    text = text.replace(_TATWEEL, "")
    text = text.translate(_TRANSLATE)
    return re.sub(r"\s+", " ", text).strip().casefold()


def resolve(field: dict | None, locale: str) -> tuple[str, str, bool]:
    """Return (value, resolved_locale, is_fallback) for a localised JSON field."""
    if not field:
        return "", locale, False
    if field.get(locale):
        return field[locale], locale, False
    for candidate in FALLBACK_CHAIN:
        if field.get(candidate):
            return field[candidate], candidate, True
    first = next(iter(field.items()), ("", ""))
    return first[1], first[0], True


def pick(field: dict | None, locale: str) -> str:
    return resolve(field, locale)[0]


def normalize_locale(raw: str | None) -> str:
    if not raw:
        return settings.default_locale
    code = raw.split(",")[0].split("-")[0].strip().lower()
    return code if code in settings.locales else settings.default_locale


def direction(locale: str) -> str:
    return "rtl" if locale == "ar" else "ltr"
