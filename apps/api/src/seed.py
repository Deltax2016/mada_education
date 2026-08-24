"""Demo data.

Deliberately includes the cases that break naive implementations:
  - a course whose English translation is missing on one lesson (fallback path)
  - a price in OMR where the third decimal matters (19.900, not 19.90)
  - an Arabic short-answer question whose key is written with a hamza while
    students will type it without one
"""

import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select

from .core.db import Base, SessionLocal, engine
from .models import (
    Category,
    Course,
    Enrollment,
    Lesson,
    LessonVersion,
    MediaAsset,
    Module,
    Question,
    QuestionOption,
    Quiz,
    Review,
    User,
)

SAMPLE_VIDEO = (
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
)


def cover(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/1200/675"


def avatar(seed: str) -> str:
    return f"https://picsum.photos/seed/{seed}/160/160"


def p(ar: str, en: str) -> dict:
    return {"ar": ar, "en": en}


async def run() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with SessionLocal() as db:
        # ----------------------------------------------------------- people
        instructors = [
            User(
                email="salim.alharthy@mada.example",
                name_ar="د. سالم بن ناصر الحارثي",
                name_en="Dr. Salim Al Harthy",
                avatar_url=avatar("salim-harthy-portrait"),
                roles=["instructor"],
            ),
            User(
                email="muna.albalushi@mada.example",
                name_ar="منى بنت خالد البلوشي",
                name_en="Muna Al Balushi",
                avatar_url=avatar("muna-balushi-portrait"),
                roles=["instructor"],
            ),
            User(
                email="yousuf.alrawahi@mada.example",
                name_ar="يوسف بن حمد الرواحي",
                name_en="Yousuf Al Rawahi",
                avatar_url=avatar("yousuf-rawahi-portrait"),
                roles=["instructor"],
            ),
        ]
        student = User(
            email="student@mada.example",
            name_ar="عائشة بنت سعيد الزدجالية",
            name_en="Aisha Al Zadjali",
            avatar_url=avatar("aisha-zadjali-portrait"),
            roles=["student"],
        )
        admin = User(
            email="admin@mada.example",
            name_ar="مدير المنصة",
            name_en="Platform Admin",
            roles=["admin", "instructor"],
        )
        db.add_all([*instructors, student, admin])
        await db.flush()

        # ------------------------------------------------------- categories
        categories = [
            Category(slug="business", title=p("إدارة الأعمال", "Business"), position=1),
            Category(slug="finance", title=p("المالية والمحاسبة", "Finance"), position=2),
            Category(slug="technology", title=p("التقنية", "Technology"), position=3),
            Category(slug="marketing", title=p("التسويق", "Marketing"), position=4),
            Category(slug="languages", title=p("اللغات", "Languages"), position=5),
        ]
        db.add_all(categories)
        await db.flush()
        cat = {c.slug: c for c in categories}

        # ----------------------------------------------------- media assets
        video_intro = MediaAsset(
            kind="video",
            storage_key=SAMPLE_VIDEO,
            poster_url=cover("vat-oman-lesson-intro"),
            duration_seconds=15,
            mime_type="video/mp4",
            status="ready",
        )
        video_returns = MediaAsset(
            kind="video",
            storage_key=SAMPLE_VIDEO,
            poster_url=cover("vat-oman-lesson-returns"),
            duration_seconds=15,
            mime_type="video/mp4",
            status="ready",
        )
        db.add_all([video_intro, video_returns])
        await db.flush()

        # ------------------------------------------------- the flagship course
        vat = Course(
            slug="vat-compliance-oman",
            title=p(
                "ضريبة القيمة المضافة في سلطنة عمان: من التسجيل إلى الإقرار",
                "VAT in Oman: from registration to filing",
            ),
            subtitle=p(
                "دورة عملية لأصحاب الأعمال والمحاسبين تغطي التسجيل والفوترة والإقرارات الربعية.",
                "A practical course for owners and accountants covering registration, invoicing and quarterly returns.",
            ),
            description=p(
                "تشرح هذه الدورة كيفية التعامل مع ضريبة القيمة المضافة بنسبة 5% في سلطنة عمان خطوة بخطوة: "
                "متى يجب التسجيل، كيف تُصدر فاتورة ضريبية صحيحة، وكيف تُعدّ الإقرار الربعي دون أخطاء. "
                "كل درس مبني على حالات واقعية من شركات صغيرة ومتوسطة في مسقط وصلالة.",
                "This course walks through Oman's 5% VAT step by step: when registration becomes mandatory, "
                "how to issue a compliant tax invoice, and how to prepare the quarterly return without errors. "
                "Every lesson is built on real cases from small and mid-sized companies in Muscat and Salalah.",
            ),
            outcomes={
                "ar": [
                    "تحديد ما إذا كان نشاطك ملزماً بالتسجيل في ضريبة القيمة المضافة",
                    "إصدار فاتورة ضريبية مستوفية للشروط النظامية",
                    "احتساب الضريبة على المبيعات والمشتريات بشكل صحيح",
                    "إعداد الإقرار الربعي وتفادي الأخطاء الأكثر شيوعاً",
                ],
                "en": [
                    "Decide whether your business must register for VAT",
                    "Issue a tax invoice that meets the legal requirements",
                    "Calculate output and input tax correctly",
                    "Prepare the quarterly return and avoid the most common errors",
                ],
            },
            requirements={
                "ar": ["معرفة أساسية بالمحاسبة", "جهاز حاسوب مع جدول بيانات"],
                "en": ["Basic accounting knowledge", "A computer with a spreadsheet"],
            },
            cover_url=cover("oman-vat-accounting-desk"),
            level="intermediate",
            available_locales=["ar", "en"],
            duration_minutes=180,
            category_id=cat["finance"].id,
            instructor_id=instructors[0].id,
            status="published",
            is_free=False,
            price_minor=19_900,  # 19.900 OMR. Three decimals, not two.
            currency="OMR",
            rating_avg=4.7,
            rating_count=126,
            students_count=842,
        )
        db.add(vat)
        await db.flush()

        m1 = Module(course_id=vat.id, title=p("الأساسيات والتسجيل", "Basics and registration"), position=1)
        m2 = Module(course_id=vat.id, title=p("الفوترة والاحتساب", "Invoicing and calculation"), position=2)
        m3 = Module(course_id=vat.id, title=p("الإقرار الربعي", "The quarterly return"), position=3)
        db.add_all([m1, m2, m3])
        await db.flush()

        lessons_spec = [
            (
                m1, "what-is-vat", "video",
                p("ما هي ضريبة القيمة المضافة ولماذا تهمك", "What VAT is and why it matters"),
                18, True, video_intro.id,
                [
                    {"id": "b1", "type": "heading", "data": {"level": 2, "text": "الفكرة في سطر واحد"}},
                    {"id": "b2", "type": "paragraph", "data": {"text": "ضريبة القيمة المضافة ضريبة غير مباشرة بنسبة 5% تُفرض على معظم السلع والخدمات في سلطنة عمان. أنت لا تدفعها من أرباحك: أنت تجمعها من العميل وتوردها لجهاز الضرائب."}},
                    {"id": "b3", "type": "callout", "data": {"variant": "info", "text": "الخطأ الأكثر شيوعاً بين أصحاب الأعمال الجدد هو معاملة الضريبة المحصّلة كإيراد. هي ليست إيرادك في أي لحظة."}},
                    {"id": "b4", "type": "heading", "data": {"level": 2, "text": "الضريبة على المخرجات والمدخلات"}},
                    {"id": "b5", "type": "paragraph", "data": {"text": "ما تحصّله من عملائك يسمى ضريبة المخرجات. ما تدفعه لمورديك يسمى ضريبة المدخلات. ما توّرده فعلياً هو الفرق بينهما."}},
                    {"id": "b6", "type": "list", "data": {"ordered": False, "items": ["ضريبة المخرجات: 5% على فواتير مبيعاتك", "ضريبة المدخلات: 5% دفعتها على مشترياتك الخاضعة", "المستحق = المخرجات ناقص المدخلات"]}},
                ],
                [
                    {"id": "b1", "type": "heading", "data": {"level": 2, "text": "The idea in one line"}},
                    {"id": "b2", "type": "paragraph", "data": {"text": "VAT is an indirect 5% tax applied to most goods and services in Oman. You do not pay it out of your profit: you collect it from the customer and remit it to the tax authority."}},
                    {"id": "b3", "type": "callout", "data": {"variant": "info", "text": "The most common mistake among new business owners is treating collected VAT as revenue. It is never your money."}},
                    {"id": "b4", "type": "heading", "data": {"level": 2, "text": "Output tax and input tax"}},
                    {"id": "b5", "type": "paragraph", "data": {"text": "What you collect from customers is output tax. What you pay suppliers is input tax. What you actually remit is the difference."}},
                    {"id": "b6", "type": "list", "data": {"ordered": False, "items": ["Output tax: 5% on your sales invoices", "Input tax: 5% you paid on taxable purchases", "Payable = output minus input"]}},
                ],
            ),
            (
                m1, "registration-threshold", "content",
                p("متى يصبح التسجيل إلزامياً", "When registration becomes mandatory"),
                14, True, None,
                [
                    {"id": "c1", "type": "paragraph", "data": {"text": "التسجيل الإلزامي مرتبط بقيمة التوريدات السنوية الخاضعة للضريبة. راقب رقمك على مدى اثني عشر شهراً متتالية، لا على السنة المالية وحدها."}},
                    {"id": "c2", "type": "callout", "data": {"variant": "warning", "text": "الحدود والنسب تتغير بقرار من الجهات المختصة. تحقق دائماً من آخر تحديث على موقع جهاز الضرائب قبل اتخاذ قرار."}},
                    {"id": "c3", "type": "heading", "data": {"level": 3, "text": "التسجيل الاختياري"}},
                    {"id": "c4", "type": "paragraph", "data": {"text": "إذا كانت أغلب مشترياتك خاضعة للضريبة وعملاؤك شركات مسجلة، فقد يكون التسجيل الاختياري في مصلحتك لأنه يتيح لك استرداد ضريبة المدخلات."}},
                ],
                [
                    {"id": "c1", "type": "paragraph", "data": {"text": "Mandatory registration is tied to the value of your annual taxable supplies. Track the figure across twelve rolling months, not just the fiscal year."}},
                    {"id": "c2", "type": "callout", "data": {"variant": "warning", "text": "Thresholds and rates change by decision of the authorities. Always check the latest guidance from the tax authority before acting."}},
                    {"id": "c3", "type": "heading", "data": {"level": 3, "text": "Voluntary registration"}},
                    {"id": "c4", "type": "paragraph", "data": {"text": "If most of your purchases are taxable and your customers are registered businesses, voluntary registration can work in your favour because it lets you recover input tax."}},
                ],
            ),
            (
                m2, "tax-invoice", "video",
                p("عناصر الفاتورة الضريبية الصحيحة", "What a compliant tax invoice contains"),
                22, False, video_returns.id,
                [
                    {"id": "d1", "type": "paragraph", "data": {"text": "الفاتورة الناقصة هي السبب الأول لرفض استرداد ضريبة المدخلات عند المراجعة. القائمة التالية هي الحد الأدنى الذي يجب أن يظهر على كل فاتورة تصدرها."}},
                    {"id": "d2", "type": "list", "data": {"ordered": True, "items": ["كلمة «فاتورة ضريبية» بشكل واضح", "اسم المورّد وعنوانه ورقم التسجيل الضريبي", "تاريخ الإصدار وتاريخ التوريد إن اختلفا", "رقم تسلسلي فريد لا يتكرر", "وصف السلعة أو الخدمة والكمية", "المبلغ قبل الضريبة، ونسبة الضريبة، ومبلغ الضريبة، والإجمالي"]}},
                    {"id": "d3", "type": "callout", "data": {"variant": "warning", "text": "الترقيم التسلسلي يجب أن يكون متصلاً بلا فجوات. الفجوة في الترقيم سؤال مباشر في أي مراجعة."}},
                    {"id": "d4", "type": "table", "data": {"headers": ["البند", "قبل الضريبة", "الضريبة 5%", "الإجمالي"], "rows": [["استشارة محاسبية", "100.000", "5.000", "105.000"], ["تدريب فريق", "250.000", "12.500", "262.500"]]}},
                    {"id": "d5", "type": "paragraph", "data": {"text": "لاحظ ثلاث خانات عشرية: الريال العماني يقسم إلى ألف بيسة، لا إلى مئة. أي نظام يتعامل مع خانتين فقط سيعطي مبالغ خاطئة."}},
                ],
                [
                    {"id": "d1", "type": "paragraph", "data": {"text": "An incomplete invoice is the number one reason input tax recovery is rejected during an audit. The list below is the minimum that must appear on every invoice you issue."}},
                    {"id": "d2", "type": "list", "data": {"ordered": True, "items": ["The words 'Tax Invoice', clearly shown", "Supplier name, address and tax registration number", "Issue date, and supply date if they differ", "A unique sequential number", "Description of the goods or service, and quantity", "Amount before tax, tax rate, tax amount, and total"]}},
                    {"id": "d3", "type": "callout", "data": {"variant": "warning", "text": "Sequential numbering must be unbroken. A gap in the sequence is a direct question in any audit."}},
                    {"id": "d4", "type": "table", "data": {"headers": ["Item", "Net", "VAT 5%", "Total"], "rows": [["Accounting consultation", "100.000", "5.000", "105.000"], ["Team training", "250.000", "12.500", "262.500"]]}},
                    {"id": "d5", "type": "paragraph", "data": {"text": "Note three decimal places: the Omani rial divides into 1000 baisa, not 100. Any system that assumes two decimals will produce wrong amounts."}},
                ],
            ),
            (
                m2, "input-tax-recovery", "content",
                p("استرداد ضريبة المدخلات وحالات الاستثناء", "Recovering input tax, and the exceptions"),
                16, False, None,
                [
                    {"id": "e1", "type": "paragraph", "data": {"text": "ليست كل ضريبة تدفعها قابلة للاسترداد. الاستثناءات محدودة لكنها تتكرر كثيراً في الشركات الصغيرة، وأغلب الملاحظات في المراجعة تأتي من هنا."}},
                    {"id": "e2", "type": "list", "data": {"ordered": False, "items": ["المصروفات الترفيهية لغير الموظفين", "المركبات الشخصية غير المخصصة للنشاط", "المشتريات بلا فاتورة ضريبية مستوفية", "التوريدات المرتبطة بنشاط معفى"]}},
                    {"id": "e3", "type": "paragraph", "data": {"text": "القاعدة العملية: احتفظ بالفاتورة الأصلية، واربطها بقيد محاسبي واحد، ولا تعتمد على كشف الحساب البنكي كإثبات."}},
                ],
                None,  # English translation not ready yet: exercises the fallback path
            ),
            (
                m3, "quarterly-return", "content",
                p("إعداد الإقرار الربعي خطوة بخطوة", "Preparing the quarterly return step by step"),
                24, False, None,
                [
                    {"id": "f1", "type": "heading", "data": {"level": 2, "text": "الترتيب الصحيح للعمل"}},
                    {"id": "f2", "type": "list", "data": {"ordered": True, "items": ["أقفل دفتر المبيعات والمشتريات للربع", "طابق مجموع الفواتير مع دفتر الأستاذ", "افصل التوريدات المعفاة عن الخاضعة", "احسب صافي المستحق أو القابل للاسترداد", "قدّم الإقرار وسدّد قبل انتهاء المهلة"]}},
                    {"id": "f3", "type": "callout", "data": {"variant": "warning", "text": "التأخير في التقديم يترتب عليه غرامة حتى لو كان صافي المستحق صفراً. قدّم في الموعد ولو كان الرقم صفراً."}},
                    {"id": "f4", "type": "paragraph", "data": {"text": "في الدرس القادم نطبّق هذه الخطوات على حالة شركة توريد مواد بناء في مسقط، بأرقام حقيقية من ربع كامل."}},
                ],
                [
                    {"id": "f1", "type": "heading", "data": {"level": 2, "text": "The right order of work"}},
                    {"id": "f2", "type": "list", "data": {"ordered": True, "items": ["Close the sales and purchase ledgers for the quarter", "Reconcile invoice totals against the general ledger", "Separate exempt supplies from taxable ones", "Calculate the net payable or refundable amount", "File and pay before the deadline"]}},
                    {"id": "f3", "type": "callout", "data": {"variant": "warning", "text": "Late filing carries a penalty even when the net amount is zero. File on time regardless of the figure."}},
                    {"id": "f4", "type": "paragraph", "data": {"text": "The next lesson applies these steps to a building materials supplier in Muscat, using real figures from a full quarter."}},
                ],
            ),
            (
                m3, "final-check", "quiz",
                p("اختبار: هل أنت جاهز للإقرار؟", "Quiz: are you ready to file?"),
                10, False, None,
                [{"id": "g1", "type": "paragraph", "data": {"text": "ستة أسئلة تغطي ما مررنا به. النجاح من 70%، ولديك ثلاث محاولات."}}],
                [{"id": "g1", "type": "paragraph", "data": {"text": "Six questions covering what we went through. Pass mark is 70%, and you have three attempts."}}],
            ),
        ]

        quiz_lesson = None
        for i, (module, slug, kind, title, minutes, preview, media_id, ar_blocks, en_blocks) in enumerate(
            lessons_spec, start=1
        ):
            lesson = Lesson(
                module_id=module.id,
                course_id=vat.id,
                slug=slug,
                title=title,
                type=kind,
                position=i,
                duration_minutes=minutes,
                is_preview=preview,
                media_asset_id=media_id,
                status="published",
            )
            db.add(lesson)
            await db.flush()
            db.add(
                LessonVersion(
                    lesson_id=lesson.id, locale="ar", content=ar_blocks,
                    status="published", translation_status="done",
                )
            )
            if en_blocks is not None:
                db.add(
                    LessonVersion(
                        lesson_id=lesson.id, locale="en", content=en_blocks,
                        status="published", translation_status="done",
                    )
                )
            if kind == "quiz":
                quiz_lesson = lesson

        # ------------------------------------------------------------- quiz
        quiz = Quiz(
            course_id=vat.id,
            lesson_id=quiz_lesson.id,
            title=p("اختبار نهاية الدورة", "End of course quiz"),
            time_limit_seconds=600,
            max_attempts=3,
            passing_score=70,
            review_policy="after_submit",
            multiple_policy="partial",
        )
        db.add(quiz)
        await db.flush()

        questions_spec = [
            (
                "single",
                p("ما نسبة ضريبة القيمة المضافة القياسية في سلطنة عمان؟",
                  "What is the standard VAT rate in Oman?"),
                p("النسبة القياسية 5% وهي من أدنى النسب في المنطقة.",
                  "The standard rate is 5%, among the lowest in the region."),
                [(p("5%", "5%"), True), (p("10%", "10%"), False),
                 (p("15%", "15%"), False), (p("لا توجد ضريبة", "No VAT applies"), False)],
                {},
            ),
            (
                "boolean",
                p("الضريبة التي تحصّلها من العميل تُعد جزءاً من إيرادك.",
                  "VAT collected from a customer counts as part of your revenue."),
                p("لا. المبلغ المحصّل أمانة لدى المنشأة حتى يورد لجهاز الضرائب.",
                  "No. The collected amount is held on behalf of the tax authority until remitted."),
                [(p("صحيح", "True"), False), (p("خطأ", "False"), True)],
                {},
            ),
            (
                "multiple",
                p("أي من العناصر التالية يجب أن تظهر على الفاتورة الضريبية؟ اختر كل ما ينطبق.",
                  "Which of the following must appear on a tax invoice? Select all that apply."),
                p("رقم التسجيل الضريبي والرقم التسلسلي ومبلغ الضريبة كلها إلزامية. شعار الشركة ليس شرطاً نظامياً.",
                  "The tax registration number, the sequential number and the tax amount are all required. A company logo is not a legal requirement."),
                [
                    (p("رقم التسجيل الضريبي للمورّد", "Supplier tax registration number"), True),
                    (p("رقم تسلسلي فريد", "A unique sequential number"), True),
                    (p("مبلغ الضريبة بشكل منفصل", "The tax amount, shown separately"), True),
                    (p("شعار الشركة", "The company logo"), False),
                ],
                {},
            ),
            (
                "number",
                p("فاتورة بقيمة 250.000 ريال عماني قبل الضريبة. كم مبلغ الضريبة بالريال؟",
                  "An invoice is 250.000 OMR before tax. What is the tax amount in rials?"),
                p("250.000 × 5% = 12.500 ريال، أي 12500 بيسة.",
                  "250.000 × 5% = 12.500 rials, that is 12500 baisa."),
                [],
                {"target": 12.5, "tolerance": 0.001, "unit": "OMR"},
            ),
            (
                "short_text",
                p("ما الاسم الذي يطلق على الضريبة التي تدفعها على مشترياتك؟ (كلمتان)",
                  "What is the tax you pay on your purchases called? (two words)"),
                p("ضريبة المدخلات. وهي ما تخصمه من ضريبة المخرجات عند إعداد الإقرار.",
                  "Input tax. It is what you deduct from output tax when preparing the return."),
                [],
                # The key is stored with a hamza; students type it without one.
                # Arabic normalisation is what makes both answers correct.
                {"accepted": ["ضريبة المدخلات", "المدخلات", "input tax", "input"]},
            ),
            (
                "single",
                p("متى يجب تقديم الإقرار إذا كان صافي المستحق صفراً؟",
                  "When must the return be filed if the net payable is zero?"),
                p("في الموعد المحدد كالمعتاد. التأخير يترتب عليه غرامة بغض النظر عن المبلغ.",
                  "On the normal deadline. Late filing carries a penalty regardless of the amount."),
                [
                    (p("في الموعد المحدد كالمعتاد", "On the normal deadline"), True),
                    (p("لا حاجة لتقديم إقرار", "No return is needed"), False),
                    (p("مع إقرار الربع التالي", "With the next quarter's return"), False),
                    (p("خلال سنة", "Within a year"), False),
                ],
                {},
            ),
        ]

        for i, (kind, prompt, explanation, options, config) in enumerate(questions_spec, start=1):
            question = Question(
                quiz_id=quiz.id, position=i, type=kind, prompt=prompt,
                explanation=explanation, points=1, config=config,
            )
            db.add(question)
            await db.flush()
            for j, (content, correct) in enumerate(options, start=1):
                db.add(
                    QuestionOption(
                        question_id=question.id, position=j, content=content, is_correct=correct
                    )
                )

        # --------------------------------------------------- authored courses
        # Everything past the flagship comes from content/courses.json, which is
        # produced by the authoring workflow. Catalogue metadata that the writer
        # has no opinion about lives here instead: who teaches it, what it costs,
        # which shelf it sits on.
        META = {
            "digital-marketing-gulf": dict(
                category="marketing", instructor=1, level="beginner",
                price=24_500, rating=4.6, ratings=89, students=1_204,
                cover="gulf-small-business-marketing"),
            "excel-for-finance": dict(
                category="finance", instructor=0, level="intermediate",
                price=29_900, rating=4.8, ratings=213, students=1_876,
                cover="excel-spreadsheet-finance-work"),
            "cybersecurity-essentials": dict(
                category="technology", instructor=2, level="beginner",
                price=0, rating=4.4, ratings=341, students=5_120,
                cover="cybersecurity-office-training"),
            "business-english-meetings": dict(
                category="languages", instructor=1, level="beginner",
                price=17_500, rating=4.5, ratings=97, students=743,
                cover="bilingual-office-meeting-muscat"),
            "project-management-foundations": dict(
                category="business", instructor=2, level="intermediate",
                price=34_000, rating=4.7, ratings=156, students=982,
                cover="project-planning-team-board"),
            "omani-labour-law-managers": dict(
                category="business", instructor=0, level="intermediate",
                price=27_500, rating=4.6, ratings=64, students=418,
                cover="oman-employment-contract-desk"),
            "reading-financial-statements": dict(
                category="finance", instructor=0, level="beginner",
                price=21_000, rating=4.7, ratings=118, students=1_034,
                cover="financial-statements-annual-report"),
            "government-tenders-oman": dict(
                category="business", instructor=2, level="advanced",
                price=39_000, rating=4.5, ratings=42, students=287,
                cover="tender-documents-procurement-office"),
            "customer-service-arabic": dict(
                category="business", instructor=1, level="beginner",
                price=15_500, rating=4.4, ratings=73, students=651,
                cover="customer-support-desk-gulf"),
        }

        content_file = Path(__file__).with_name("content") / "courses.json"
        authored = json.loads(content_file.read_text()) if content_file.exists() else []

        for spec in authored:
            meta = META.get(spec["slug"])
            if not meta:
                print(f"  skipping {spec['slug']}: no catalogue metadata")
                continue

            duration = sum(
                lesson["durationMinutes"]
                for module in spec["modules"]
                for lesson in module["lessons"]
            )
            course = Course(
                slug=spec["slug"],
                title=spec["title"],
                subtitle=spec["subtitle"],
                description=spec["description"],
                outcomes=spec["outcomes"],
                requirements=spec["requirements"],
                cover_url=cover(meta["cover"]),
                level=meta["level"],
                available_locales=["ar", "en"],
                duration_minutes=duration,
                category_id=cat[meta["category"]].id,
                instructor_id=instructors[meta["instructor"]].id,
                status="published",
                is_free=meta["price"] == 0,
                price_minor=meta["price"],
                currency="OMR",
                rating_avg=meta["rating"],
                rating_count=meta["ratings"],
                students_count=meta["students"],
            )
            db.add(course)
            await db.flush()

            position = 0
            quiz_lesson = None
            for module_index, module_spec in enumerate(spec["modules"], start=1):
                module = Module(
                    course_id=course.id, title=module_spec["title"], position=module_index
                )
                db.add(module)
                await db.flush()

                for lesson_spec in module_spec["lessons"]:
                    position += 1
                    lesson = Lesson(
                        module_id=module.id,
                        course_id=course.id,
                        slug=lesson_spec["slug"],
                        title=lesson_spec["title"],
                        type="content",
                        position=position,
                        duration_minutes=lesson_spec["durationMinutes"],
                        # The opening lesson of every course is readable before
                        # buying: a catalogue where nothing can be sampled converts
                        # badly, and it costs one lesson to fix.
                        is_preview=position == 1,
                        status="published",
                    )
                    db.add(lesson)
                    await db.flush()
                    quiz_lesson = lesson
                    for loc, blocks in (("ar", lesson_spec["blocksAr"]),
                                        ("en", lesson_spec["blocksEn"])):
                        db.add(
                            LessonVersion(
                                lesson_id=lesson.id, locale=loc, content=blocks,
                                status="published", translation_status="done",
                            )
                        )

            questions_spec = spec.get("questions") or []
            if questions_spec and quiz_lesson is not None:
                exam = Lesson(
                    module_id=module.id,
                    course_id=course.id,
                    slug="final-quiz",
                    title=p("اختبار نهاية الدورة", "End of course quiz"),
                    type="quiz",
                    position=position + 1,
                    duration_minutes=10,
                    status="published",
                )
                db.add(exam)
                await db.flush()
                db.add(
                    LessonVersion(
                        lesson_id=exam.id, locale="ar", status="published",
                        content=[{"id": "q1", "type": "paragraph", "data": {
                            "text": "أسئلة تغطي ما مررت به. النجاح من 70%، ولديك ثلاث محاولات."}}],
                    )
                )
                db.add(
                    LessonVersion(
                        lesson_id=exam.id, locale="en", status="published",
                        content=[{"id": "q1", "type": "paragraph", "data": {
                            "text": "Questions covering what you went through. Pass mark is 70%, and you have three attempts."}}],
                    )
                )

                quiz = Quiz(
                    course_id=course.id,
                    lesson_id=exam.id,
                    title=spec.get("quizTitle") or p("اختبار نهاية الدورة", "End of course quiz"),
                    time_limit_seconds=600,
                    max_attempts=3,
                    passing_score=70,
                    review_policy="after_submit",
                    multiple_policy="partial",
                )
                db.add(quiz)
                await db.flush()

                for q_index, q in enumerate(questions_spec, start=1):
                    config = {}
                    if q["type"] == "short_text":
                        config["accepted"] = q.get("accepted") or []
                    if q["type"] == "number":
                        config["target"] = q.get("target", 0)
                        config["tolerance"] = q.get("tolerance", 0.01)
                        if q.get("unit"):
                            config["unit"] = q["unit"]
                    question = Question(
                        quiz_id=quiz.id, position=q_index, type=q["type"],
                        prompt=q["prompt"], explanation=q["explanation"],
                        points=1, config=config,
                    )
                    db.add(question)
                    await db.flush()
                    for o_index, option in enumerate(q.get("options") or [], start=1):
                        db.add(
                            QuestionOption(
                                question_id=question.id, position=o_index,
                                content=option["content"], is_correct=option["isCorrect"],
                            )
                        )

        # ---------------------------------------------------------- reviews
        db.add_all([
            Review(course_id=vat.id, user_id=student.id, rating=5, locale="ar",
                   content="طبّقت الخطوات على إقرار شركتي مباشرة بعد الدرس الخامس. أول مرة أقدّم بدون مراجعة المحاسب الخارجي."),
            Review(course_id=vat.id, user_id=instructors[1].id, rating=5, locale="ar",
                   content="أفضل ما فيها أن الأمثلة برقم عماني حقيقي بثلاث خانات، لا أمثلة مترجمة من سوق آخر."),
            Review(course_id=vat.id, user_id=instructors[2].id, rating=4, locale="en",
                   content="Clear and practical. I would have liked one more worked example on partial exemption."),
        ])

        # student already owns the flagship course so the app has something to show
        db.add(Enrollment(user_id=student.id, course_id=vat.id, source="purchase", locale="ar"))

        await db.commit()
        result = await db.execute(select(Course))
        print(f"seeded {len(result.scalars().all())} courses")
        print("  sign in with a code sent to any of these addresses:")
        print("    student@mada.example   owns the VAT course")
        print("    admin@mada.example     can upload media")


if __name__ == "__main__":
    asyncio.run(run())
