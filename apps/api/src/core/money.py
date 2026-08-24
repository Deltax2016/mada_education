"""Money handling.

OMR, KWD and BHD are three-decimal currencies (1 rial = 1000 baisa).
Every amount is stored and transported as an integer in minor units plus the
currency code; the exponent comes from this table, never from a hardcoded 100.
Thawani itself takes amounts in baisa, so this is not an abstraction for its own
sake - it is the shape the payment provider requires.
"""

from dataclasses import dataclass

CURRENCY_EXPONENT: dict[str, int] = {
    "OMR": 3,
    "KWD": 3,
    "BHD": 3,
    "SAR": 2,
    "AED": 2,
    "QAR": 2,
    "USD": 2,
    "EUR": 2,
}

CURRENCY_SYMBOL: dict[str, dict[str, str]] = {
    "OMR": {"ar": "ر.ع.", "en": "OMR"},
    "SAR": {"ar": "ر.س", "en": "SAR"},
    "AED": {"ar": "د.إ", "en": "AED"},
    "USD": {"ar": "$", "en": "USD"},
}


@dataclass(frozen=True)
class Money:
    minor: int
    currency: str = "OMR"

    @property
    def exponent(self) -> int:
        return CURRENCY_EXPONENT.get(self.currency, 2)

    def display(self) -> str:
        exp = self.exponent
        if exp == 0:
            return str(self.minor)
        whole, frac = divmod(abs(self.minor), 10**exp)
        sign = "-" if self.minor < 0 else ""
        return f"{sign}{whole}.{str(frac).zfill(exp)}"

    def to_api(self, locale: str = "ar") -> dict:
        return {
            "minor": self.minor,
            "currency": self.currency,
            "exponent": self.exponent,
            "display": self.display(),
            "symbol": CURRENCY_SYMBOL.get(self.currency, {}).get(locale, self.currency),
        }
