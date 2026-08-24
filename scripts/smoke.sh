#!/usr/bin/env bash
# End to end check of the paths that are easy to break:
# paywall, locale fallback, three-decimal money, and Arabic answer grading.
set -euo pipefail
API="${API:-http://127.0.0.1:8010/api/v1}"
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

otp=$(curl -s -X POST "$API/auth/email/code" -H 'Content-Type: application/json' \
  -d '{"email":"student@mada.example"}')
id=$(echo "$otp" | python3 -c "import json,sys; print(json.load(sys.stdin)['otpId'])")
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

python3 - "$API" "$tok" <<'PY'
import json, subprocess, sys
api, tok = sys.argv[1], sys.argv[2]

def call(method, path, body=None):
    cmd = ["curl", "-s", "-X", method, api + path, "-H", "Authorization: Bearer " + tok]
    if body is not None:
        cmd += ["-H", "Content-Type: application/json", "-d", json.dumps(body)]
    return json.loads(subprocess.run(cmd, capture_output=True, text=True).stdout)

quiz = call("GET", "/learn/courses/vat-compliance-oman/lessons/final-check?locale=ar")["quizId"]
attempt = call("POST", "/quizzes/%s/attempts?locale=ar" % quiz)

# Attempts are a finite resource, so say so plainly instead of dying on a
# KeyError two frames later.
if "questions" not in attempt:
    code = attempt.get("code", "unknown")
    if code == "quiz.attempts_exhausted":
        print("  FAIL quiz attempts are used up. Run `make seed` for fresh fixtures.")
    else:
        print("  FAIL could not start a quiz attempt (%s)" % code)
    raise SystemExit(1)

target = next(q for q in attempt["questions"] if q["type"] == "short_text")

# The answer key is stored with a ta marbuta; the learner types a ha, exactly as
# people actually type. Normalisation is what makes this correct.
call("PUT", "/quizzes/attempts/%s/answers/%s" % (attempt["attemptId"], target["id"]),
     {"answer": {"text": "\u0636\u0631\u064a\u0628\u0647 \u0627\u0644\u0645\u062f\u062e\u0644\u0627\u062a"}})
result = call("POST", "/quizzes/attempts/%s/submit?locale=ar" % attempt["attemptId"])
item = next(x for x in result["review"] if x["questionId"] == target["id"])
if not item["isCorrect"]:
    print("  FAIL arabic normalisation rejected a correct answer")
    raise SystemExit(1)
print("  ok   arabic answer graded correctly without the hamza")
PY

# --- author side -------------------------------------------------------------
# Two authors, so the isolation check is instructor against instructor rather
# than instructor against anonymous. The second one is the interesting case.

python3 - "$API" <<'PY'
import json, subprocess, sys
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

a = sign_in("smoke.author.a@mada.example")
b = sign_in("smoke.author.b@mada.example")

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
PY

echo "smoke: all checks passed"
