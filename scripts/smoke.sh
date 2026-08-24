#!/usr/bin/env bash
# End to end check of the paths that are easy to break:
# paywall, locale fallback, three-decimal money, and Arabic answer grading.
set -euo pipefail
API="${API:-http://127.0.0.1:8010/api/v1}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
pass() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; exit 1; }

echo "smoke: $API"

code=$(curl -s "$API/learn/courses/vat-compliance-oman/lessons/tax-invoice?locale=ar" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
[ "$code" = "auth.unauthenticated" ] && pass "lesson content requires an account" \
  || fail "expected auth.unauthenticated, got '$code'"

# Resolve the lesson from the catalogue rather than hardcoding a slug: lesson
# slugs come from the authored content and change when a course is rewritten.
free_lesson=$(curl -s "$API/catalog/courses/cybersecurity-essentials?locale=ar" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['curriculum'][0]['lessons'][0]['slug'])")
code=$(curl -s "$API/learn/courses/cybersecurity-essentials/lessons/$free_lesson?locale=ar" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
[ "$code" = "auth.unauthenticated" ] && pass "even the free course needs an account" \
  || fail "expected auth.unauthenticated on the free course, got '$code'"

status=$(curl -s -o /dev/null -w '%{http_code}' "$API/catalog/courses/vat-compliance-oman?locale=ar")
[ "$status" = "200" ] && pass "catalogue stays public so the site is findable" \
  || fail "catalogue returned $status"

price=$(curl -s "$API/catalog/courses/vat-compliance-oman?locale=ar" \
  | python3 -c "import json,sys; p=json.load(sys.stdin)['price']; print(f\"{p['display']}|{p['exponent']}\")")
[ "$price" = "19.900|3" ] && pass "OMR renders with three decimals" \
  || fail "expected 19.900|3, got '$price'"

bad=$(curl -s -X POST "$API/auth/email/code" -H 'Content-Type: application/json' \
  -d '{"email":"not-an-address"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
[ "$bad" = "auth.email_invalid" ] && pass "a malformed address is rejected" \
  || fail "expected auth.email_invalid, got '$bad'"

# The seeded learner specifically: the locale fallback check needs someone who
# owns the hand written course, which is the only one with a lesson that has no
# English version.
otp=$(curl -s -X POST "$API/auth/email/code" -H 'Content-Type: application/json' \
  -d '{"email":"student@mada.example"}')
id=$(echo "$otp" | python3 -c "
import json, sys
d = json.load(sys.stdin)
if 'otpId' not in d:
    code = d.get('code', 'unknown')
    hint = 'the sign-in rate limit is doing its job. Wait, or run make seed.' \
        if code == 'rate_limited' else 'is the API seeded?'
    sys.stderr.write(f'  FAIL could not request a sign-in code ({code}). {hint}\n')
    raise SystemExit(1)
print(d['otpId'])") || exit 1
code=$(echo "$otp" | python3 -c "import json,sys; print(json.load(sys.stdin)['devCode'])")

wrong=$(curl -s -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' \
  -d "{\"otpId\":\"$id\",\"code\":\"000000\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
[ "$wrong" = "auth.code_invalid" ] && pass "a wrong code is rejected" \
  || fail "expected auth.code_invalid, got '$wrong'"

tok=$(curl -s -X POST "$API/auth/email/verify" -H 'Content-Type: application/json' \
  -d "{\"otpId\":\"$id\",\"code\":\"$code\"}" \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['accessToken'])")
[ -n "$tok" ] && pass "email plus one time code signs in" || fail "no access token"

paid_lesson=$(curl -s "$API/catalog/courses/digital-marketing-gulf?locale=ar" \
  | python3 -c "
import json,sys
c=json.load(sys.stdin)
print(next(l['slug'] for m in c['curriculum'] for l in m['lessons'] if l['locked']))")
code=$(curl -s "$API/learn/courses/digital-marketing-gulf/lessons/$paid_lesson?locale=ar" \
  -H "Authorization: Bearer $tok" \
  | python3 -c "import json,sys; print(json.load(sys.stdin).get('code',''))")
[ "$code" = "access.paywall" ] && pass "signed in but unenrolled still hits the paywall" \
  || fail "expected access.paywall, got '$code'"

meta=$(curl -s "$API/learn/courses/vat-compliance-oman/lessons/input-tax-recovery?locale=en" \
  -H "Authorization: Bearer $tok" \
  | python3 -c "import json,sys; m=json.load(sys.stdin)['meta']; print(f\"{m['resolvedLocale']}|{m['isFallback']}\")")
[ "$meta" = "ar|True" ] && pass "missing translation falls back and says so" \
  || fail "expected ar|True, got '$meta'"

quiz=$(curl -s "$API/learn/courses/vat-compliance-oman/lessons/final-check?locale=ar" \
  -H "Authorization: Bearer $tok" | python3 -c "import json,sys; print(json.load(sys.stdin)['quizId'])")
attempt=$(curl -s -X POST "$API/quizzes/$quiz/attempts?locale=ar" -H "Authorization: Bearer $tok")
echo "$attempt" | grep -q '"is_correct"' && fail "answer key leaked into the attempt payload"
pass "correct answers never leave the server during an attempt"

python3 - "$API" "$ROOT" <<'PY'
import json, pathlib, subprocess, sys, uuid

api, root = sys.argv[1], pathlib.Path(sys.argv[2])


def curl(method, path, token=None, body=None):
    cmd = ["curl", "-s", "-X", method, api + path]
    if token:
        cmd += ["-H", "Authorization: Bearer " + token]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)


def sign_in(email):
    req = curl("POST", "/auth/email/code", body={"email": email})
    return curl(
        "POST", "/auth/email/verify",
        body={"otpId": req["otpId"], "code": req["devCode"]},
    )["accessToken"]


def fail(message):
    print("  FAIL " + message)
    raise SystemExit(1)


# A fresh learner every run. Quiz attempts are a finite per-user resource, so a
# fixed identity makes this check pass once and fail on every run after that.
tok = sign_in(f"smoke.learner.{uuid.uuid4().hex[:10]}@mada.example")

# The free course, because a fresh learner can enrol without a purchase.
curl("POST", "/learn/courses/cybersecurity-essentials/enroll", tok)

outline = curl("GET", "/learn/courses/cybersecurity-essentials/outline?locale=ar", tok)
quiz_slug = next(
    (
        lesson["slug"]
        for module in outline["modules"]
        for lesson in module["lessons"]
        if lesson["type"] == "quiz"
    ),
    None,
)
if not quiz_slug:
    fail("the free course has no quiz lesson to grade against")

quiz_id = curl(
    "GET", f"/learn/courses/cybersecurity-essentials/lessons/{quiz_slug}?locale=ar", tok
)["quizId"]
attempt = curl("POST", f"/quizzes/{quiz_id}/attempts?locale=ar", tok)
if "questions" not in attempt:
    fail(f"could not start a quiz attempt ({attempt.get('code', 'unknown')})")

target = next((q for q in attempt["questions"] if q["type"] == "short_text"), None)
if target is None:
    fail("the quiz has no short text question, so grading cannot be checked")

# Take an accepted answer straight from the authored content and deform it the
# way a real keyboard would: ta marbuta typed as ha, alef variants flattened.
content = json.loads((root / "apps/api/src/content/courses.json").read_text())
accepted = next(
    q["accepted"]
    for course in content
    if course["slug"] == "cybersecurity-essentials"
    for q in (course.get("questions") or [])
    if q["type"] == "short_text"
)
arabic = next((a for a in accepted if any("\u0600" <= ch <= "\u06ff" for ch in a)), None)
if arabic is None:
    fail("no arabic answer in the key to deform")

# Letter shape variants where the word has them, plus a diacritic and a tatweel,
# which apply to any Arabic word. Together they cover what a real keyboard
# produces and what normalisation has to fold away.
typed = arabic.replace("\u0629", "\u0647").replace("\u0623", "\u0627").replace("\u0625", "\u0627")
typed = typed[:1] + "\u064f" + typed[1:2] + "\u0640" + typed[2:]
if typed == arabic:
    fail(f"the key {arabic!r} has nothing to deform, so this proves nothing")

curl("PUT", f"/quizzes/attempts/{attempt['attemptId']}/answers/{target['id']}", tok,
     {"answer": {"text": typed}})
result = curl("POST", f"/quizzes/attempts/{attempt['attemptId']}/submit?locale=ar", tok)
item = next(x for x in result["review"] if x["questionId"] == target["id"])
if not item["isCorrect"]:
    fail(f"arabic normalisation rejected {typed!r} against key {arabic!r}")
print(f"  ok   arabic graded correctly: typed {typed!r} for key {arabic!r}")
PY

# --- author side -------------------------------------------------------------
# Two authors, so the isolation check is instructor against instructor rather
# than instructor against anonymous. The second one is the interesting case.

python3 - "$API" <<'PY'
import json, subprocess, sys, uuid
api = sys.argv[1]

def curl(method, path, token=None, body=None):
    cmd = ["curl", "-s", "-X", method, api + path]
    if token:
        cmd += ["-H", "Authorization: Bearer " + token]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    out = subprocess.run(cmd, capture_output=True, text=True).stdout
    try:
        return json.loads(out)
    except json.JSONDecodeError:
        return {"_raw": out}

def sign_in(email):
    req = curl("POST", "/auth/email/code", body={"email": email})
    ver = curl("POST", "/auth/email/verify",
               body={"otpId": req["otpId"], "code": req["devCode"]})
    return ver["accessToken"]

def fail(msg):
    print("  FAIL " + msg)
    raise SystemExit(1)

def ok(msg):
    print("  ok   " + msg)

profile = {
    "nameAr": "مؤلف الاختبار", "nameEn": "Smoke Author",
    "headlineAr": "سطر تعريف للاختبار", "headlineEn": "Headline for the smoke test",
    "bioAr": "نبذة طويلة بما يكفي لتجاوز الحد الأدنى المطلوب في نموذج ملف المدرب هنا.",
    "bioEn": "A bio long enough to clear the minimum length the instructor profile form requires.",
}

# Fresh addresses every run. Applying for the instructor role is permanent, so
# a fixed address passes once and then fails forever on an unreseeded database.
run = uuid.uuid4().hex[:10]
a = sign_in(f"smoke.author.a.{run}@mada.example")
b = sign_in(f"smoke.author.b.{run}@mada.example")

if curl("GET", "/teach/overview", a).get("code") != "teach.not_an_instructor":
    fail("the instructor dashboard opened for someone without the role")
ok("teaching area is closed until you create a profile")

curl("POST", "/teach/apply", a, profile)
curl("POST", "/teach/apply", b, profile)
if not curl("GET", "/teach/status", a).get("isInstructor"):
    fail("applying did not grant the instructor role")
ok("filling the profile makes you an instructor")

course = curl("POST", "/teach/courses", a, {
    "titleAr": "دورة الاختبار", "titleEn": "Smoke Course",
    "subtitleAr": "وصف", "subtitleEn": "desc",
    "level": "beginner", "priceMinor": 12500, "isFree": False,
})
slug = course["slug"]

blocked = curl("POST", f"/teach/courses/{slug}/publish", a)
if blocked.get("code") != "course.not_publishable":
    fail("a course with no lessons was allowed to publish")
ok("an empty course cannot be published")

detail = curl("GET", f"/teach/courses/{slug}", a)
module_id = detail["modules"][0]["id"]
lesson = curl("POST", f"/teach/modules/{module_id}/lessons", a,
              {"titleAr": "درس", "titleEn": "Lesson", "durationMinutes": 10})
lesson_id = lesson["id"]

still = curl("POST", f"/teach/courses/{slug}/publish", a)
if "empty_lessons" not in (still.get("meta") or {}).get("problems", []):
    fail("a lesson with no content did not block publishing")
ok("a lesson with no content blocks publishing")

curl("PUT", f"/teach/lessons/{lesson_id}/content?locale=ar", a,
     {"blocks": [{"id": "b1", "type": "paragraph", "data": {"text": "نص الدرس."}}]})

# A second lesson, which is not the free preview. The first one always is, so
# reading it proves nothing about the paywall.
paid = curl("POST", f"/teach/modules/{module_id}/lessons", a,
            {"titleAr": "درس مدفوع", "titleEn": "Paid lesson", "durationMinutes": 12})
curl("PUT", f"/teach/lessons/{paid['id']}/content?locale=ar", a,
     {"blocks": [{"id": "b1", "type": "paragraph", "data": {"text": "محتوى مدفوع."}}]})
published = curl("POST", f"/teach/courses/{slug}/publish", a)
if published.get("status") != "published":
    fail("a course with real content still would not publish")
ok("a course with content publishes and reaches the catalogue")

# Every route the other instructor could reach for this course.
for label, method, path, body in [
    ("read the course", "GET", f"/teach/courses/{slug}", None),
    ("edit the course", "PATCH", f"/teach/courses/{slug}", {"titleAr": "hijacked"}),
    ("unpublish it", "POST", f"/teach/courses/{slug}/unpublish", None),
    ("read the lesson", "GET", f"/teach/lessons/{lesson_id}/content", None),
    ("overwrite the lesson", "PUT", f"/teach/lessons/{lesson_id}/content?locale=ar",
     {"blocks": []}),
    ("delete the lesson", "DELETE", f"/teach/lessons/{lesson_id}", None),
    ("list the learners", "GET", f"/teach/courses/{slug}/students", None),
]:
    if curl(method, path, b, body).get("code") != "resource.not_found":
        fail(f"another instructor could {label}")
ok("another instructor cannot touch the course through any route")

if len(curl("GET", "/teach/courses", b).get("data", [])) != 0:
    fail("one instructor's course showed up in another's list")
ok("each instructor sees only their own courses")

# Becoming an instructor is self-serve, so the role must not double as a free
# pass to the rest of the catalogue.
verdict = curl("GET", f"/learn/courses/{slug}/lessons/{paid['slug']}?locale=ar", b)
if verdict.get("code") != "access.paywall":
    fail(
        "an instructor reached another instructor's paid lesson "
        f"(got {verdict.get('code', 'the content')})"
    )
ok("the instructor role is not a free pass to other people's courses")

# And the same lesson is readable by the person who wrote it.
own = curl("GET", f"/learn/courses/{slug}/lessons/{paid['slug']}?locale=ar", a)
if "blocks" not in own:
    fail(f"an instructor could not open their own paid lesson ({own.get('code')})")
ok("an instructor can still open their own course")
PY

echo "smoke: all checks passed"
