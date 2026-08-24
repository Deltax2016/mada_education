#!/usr/bin/env python3
"""Pull authored courses out of a workflow journal into the seed's content file.

The workflow returns each course as a validated object; this only has to find
them, deduplicate by slug and write them where the seed can import them. Re-run
it after more agents finish and it picks up the new ones without disturbing the
courses already written.
"""

import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "apps/api/src/content/courses.json"

REQUIRED = {"slug", "title", "subtitle", "description", "outcomes", "requirements", "modules"}


def walk(node):
    """Yield every dict in a nested structure, including inside JSON strings."""
    if isinstance(node, dict):
        yield node
        for value in node.values():
            yield from walk(value)
    elif isinstance(node, list):
        for value in node:
            yield from walk(value)
    elif isinstance(node, str) and node.lstrip()[:1] in "{[":
        try:
            yield from walk(json.loads(node))
        except json.JSONDecodeError:
            pass


def main(journal: pathlib.Path) -> int:
    rows = [json.loads(line) for line in journal.open() if line.strip()]

    found: dict[str, dict] = {}
    for candidate in walk(rows):
        if REQUIRED.issubset(candidate.keys()) and isinstance(candidate.get("modules"), list):
            found[candidate["slug"]] = candidate

    existing: dict[str, dict] = {}
    if OUT.exists():
        existing = {c["slug"]: c for c in json.loads(OUT.read_text())}

    merged = {**existing, **found}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(list(merged.values()), ensure_ascii=False, indent=1) + "\n")

    for slug, course in sorted(merged.items()):
        lessons = sum(len(m["lessons"]) for m in course["modules"])
        quiz = len(course.get("questions") or [])
        mark = "new" if slug in found and slug not in existing else "   "
        print(f"  {mark} {slug.ljust(34)} {lessons} lessons, {quiz} questions")
    print(f"\n  {len(merged)} courses in {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(pathlib.Path(sys.argv[1])))
