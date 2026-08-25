"""Generate course cover art.

Covers were random stock photographs pulled by seed, which meant a tax course
could be illustrated with a beach. These are drawn instead: an eight fold girih
rosette over a lattice, tinted by category, with the geometry derived from the
slug so a course keeps the same face everywhere it appears.
"""

from __future__ import annotations

import math
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "apps/web/public/covers"
AVATARS = Path(__file__).resolve().parents[1] / "apps/web/public/avatars"

W, H = 1200, 675

PALETTES: dict[str, tuple[str, str, str]] = {
    # category -> (deep, mid, accent)
    "finance": ("#04211E", "#0B4F45", "#3FD8B4"),
    "marketing": ("#2A1204", "#7A3A0E", "#F5A742"),
    "technology": ("#050B26", "#16307A", "#6C8CFF"),
    "languages": ("#210A22", "#5E1E63", "#E08CE8"),
    "business": ("#071426", "#123A6B", "#63B3F5"),
    "law": ("#240A10", "#6B1B2C", "#F08196"),
    "default": ("#0A1A18", "#14453E", "#4FD1B0"),
}


def seed_of(text: str) -> int:
    total = 0
    for index, char in enumerate(text):
        total = (total * 31 + ord(char) * (index + 7)) % 1_000_003
    return total


def rosette(cx: float, cy: float, radius: float, points: int, sharpness: float) -> str:
    """An n-fold star. Sharpness sets how far the inner vertices pull in."""
    coords = []
    for i in range(points * 2):
        angle = math.pi * i / points - math.pi / 2
        r = radius if i % 2 == 0 else radius * sharpness
        coords.append(f"{cx + r * math.cos(angle):.1f},{cy + r * math.sin(angle):.1f}")
    return " ".join(coords)


def polygon(cx: float, cy: float, radius: float, sides: int, turn: float = 0) -> str:
    coords = []
    for i in range(sides):
        angle = 2 * math.pi * i / sides + turn
        coords.append(f"{cx + radius * math.cos(angle):.1f},{cy + radius * math.sin(angle):.1f}")
    return " ".join(coords)


def girih_tile(size: float, accent: str) -> str:
    """One repeat of an eight fold star and the octagon it sits in.

    Drawn as a tile rather than a single ornament so the pattern carries across
    the whole frame; a lone motif in an empty field reads as a placeholder.
    """
    half = size / 2
    star = rosette(half, half, half * 0.62, 8, 0.42)
    oct_ = polygon(half, half, half * 0.99, 8, math.pi / 8)
    return (
        f'<polygon points="{oct_}" fill="none" stroke="{accent}" stroke-width="1.3" opacity="0.28"/>'
        f'<polygon points="{star}" fill="none" stroke="{accent}" stroke-width="1.7" opacity="0.38"/>'
        f'<circle cx="{half}" cy="{half}" r="{half * 0.10:.1f}" fill="{accent}" opacity="0.30"/>'
    )


def cover_svg(slug: str, category: str) -> str:
    deep, mid, accent = PALETTES.get(category, PALETTES["default"])
    seed = seed_of(slug)
    # Ids are namespaced per course: two covers inlined on one page would
    # otherwise share the first definition and come out the same colour.
    ns = f"c{seed:06d}"

    points = (8, 12, 10, 8)[seed % 4]
    sharpness = (0.62, 0.70, 0.56, 0.66)[(seed // 4) % 4]
    turn = math.degrees((seed % 45) * math.pi / 180)
    tile = 132 + (seed % 4) * 18

    # The emblem bleeds off the trailing edge, leaving the opposite side quiet
    # for the title the card draws on top.
    cx, cy = W * 0.80, H * 0.50
    big = 330 + (seed % 5) * 18

    emblem = "".join(
        f'<polygon points="{rosette(cx, cy, big * scale, points, sharpness)}" '
        f'fill="{fill}" stroke="{stroke}" stroke-width="{width}" opacity="{opacity}" '
        f'transform="rotate({turn + spin:.1f} {cx} {cy})"/>'
        for scale, fill, stroke, width, opacity, spin in (
            (1.00, accent, "none", 0, 0.13, 0),
            (0.78, "none", accent, 2.0, 0.45, 180 / points),
            (0.56, accent, "none", 0, 0.30, 0),
            (0.34, accent, "none", 0, 0.92, 180 / points),
        )
    )

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" role="img">
  <defs>
    <linearGradient id="{ns}g" x1="0" y1="0" x2="0.85" y2="1">
      <stop offset="0" stop-color="{mid}"/>
      <stop offset="0.55" stop-color="{deep}"/>
      <stop offset="1" stop-color="{deep}"/>
    </linearGradient>
    <radialGradient id="{ns}glow" cx="{cx / W:.3f}" cy="{cy / H:.3f}" r="0.70">
      <stop offset="0" stop-color="{accent}" stop-opacity="0.20"/>
      <stop offset="1" stop-color="{accent}" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="{ns}fade" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="{deep}" stop-opacity="0.92"/>
      <stop offset="0.62" stop-color="{deep}" stop-opacity="0.10"/>
      <stop offset="1" stop-color="{deep}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="{ns}tile" width="{tile}" height="{tile}" patternUnits="userSpaceOnUse"
             patternTransform="rotate({(seed % 16) - 8})">
      {girih_tile(tile, accent)}
    </pattern>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#{ns}g)"/>
  <rect width="{W}" height="{H}" fill="url(#{ns}tile)"/>
  <rect width="{W}" height="{H}" fill="url(#{ns}glow)"/>
  {emblem}
  <rect width="{W}" height="{H}" fill="url(#{ns}fade)"/>
  <rect x="0" y="{H - 6}" width="{W}" height="6" fill="{accent}" opacity="0.85"/>
</svg>
"""


def avatar_svg(seed_text: str) -> str:
    """A small mark for an instructor.

    Deliberately not a photograph: a stock face attached to a named teacher
    claims a person who does not look like that.
    """
    seed = seed_of(seed_text)
    palette = list(PALETTES.values())[seed % len(PALETTES)]
    deep, mid, accent = palette
    ns = f"a{seed:06d}"
    points = (8, 6, 12)[seed % 3]
    turn = (seed % 40)

    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160" role="img">
  <defs>
    <linearGradient id="{ns}g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="{mid}"/>
      <stop offset="1" stop-color="{deep}"/>
    </linearGradient>
  </defs>
  <rect width="160" height="160" fill="url(#{ns}g)"/>
  <polygon points="{rosette(80, 80, 58, points, 0.62)}" fill="{accent}" opacity="0.22"
           transform="rotate({turn} 80 80)"/>
  <polygon points="{rosette(80, 80, 38, points, 0.66)}" fill="{accent}" opacity="0.85"
           transform="rotate({turn + 180 / points:.1f} 80 80)"/>
</svg>
"""


def main() -> None:
    import json
    import re
    import sys

    loader = (Path(__file__).resolve().parents[1] / "apps/api/src/content_loader.py").read_text()
    entries = re.findall(
        r'"([a-z0-9-]+)": dict\(category="([a-z]+)".*?cover="([a-z0-9-]+)"', loader, re.S
    )
    if not entries:
        sys.exit("no courses found in content_loader.py")

    OUT.mkdir(parents=True, exist_ok=True)
    AVATARS.mkdir(parents=True, exist_ok=True)
    written = []
    for slug, category, cover_name in entries:
        (OUT / f"{cover_name}.svg").write_text(cover_svg(slug, category))
        written.append(f"{cover_name}.svg <- {slug} ({category})")

    for name in sorted(set(re.findall(r'avatar="([a-z0-9-]+)"', loader))):
        (AVATARS / f"{name}.svg").write_text(avatar_svg(name))
        written.append(f"{name}.svg (avatar)")

    print(json.dumps(written, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
