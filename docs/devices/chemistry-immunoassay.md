# واجهات أجهزة الكيمياء والمناعة والـ ELISA والغازات وHbA1c — دليل ربط LIS

> الملف المصاحب: `docs/devices/data/chemistry-immunoassay.json` (نفس البيانات بصيغة آلية). تاريخ البحث: 2026-10-13.

## 1. مقدمة

الهدف: تجميع ما يمكن إثباته من مصادر عن كيفية اتصال أجهزة المعامل الأكثر شيوعاً في مصر والشرق الأوسط بنظام LIS قاهري.
**النتيجة بصراحة:** أدلة المصنّعين الكاملة (Host Interface Manuals) متاحة للجمهور لعدد قليل فقط من الأجهزة.
عدد الإدخالات: 52 (عائلات/موديلات) — high: 3، medium: 2، low: 47.
معظم الإدخالات low وتحتوي على "غير مؤكد — اسأل المورد" + قائمة أسئلة للمورد. لا تُبنى محوّلات (adapters) لهذه الأجهزة دون الحصول على المرجع الرسمي أو التقاط حقيقي من الجهاز.

وصف "شائع في مصر" (egyptMarket) هو **تقدير عام غير موثق**: لم أجد موقع موزّع مصري أو مناقصة مصرية تؤكد الانتشار (بحث واحد لم يعطِ نتيجة). تحقق من الموزّع المحلي ومن سجل هيئة الدواء المصرية.

## 2. مفتاح الثقة والمصدر

| القيمة | المعنى |
|---|---|
| `manufacturer-documented` | مقتطف من دليل/مواصفة منشورة للمصنّع (الرابط في `source`) |
| `reconstructed-from-spec` | بنيتُه أنا حسب مواصفة عامة؛ **ليست التقاطاً من جهاز حقيقي** |
| high | قرأتُ دليل المصنّع نفسه للموديل |
| medium | وثيقة قريبة/لعائلة الموديل أو جزء منها فقط |
| low | لا وثيقة للجهاز؛ مجرد معرفة عامة أو ذكر ثانوي — اعتبره غير مؤكد |

لا توجد أي رسالة في هذه الوثيقة مُلتقطة من جهاز حقيقي.

## 3. جدول الملخص

| الجهاز | البروتوكول | النقل | المنفذ الافتراضي | خيار LIS مطلوب؟ | الثقة |
|---|---|---|---|---|---|
| Roche cobas c 311 (also c 111 family: unverified) | astm | serial 9600 8N1 | غير مؤكد | غير مؤكد | high |
| Roche cobas c 111 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche cobas c 501 / c 503 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche cobas 6000 / cobas 8000 (c501+e601 / c701+e801) | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche cobas Integra 400 plus | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche cobas e 411 | astm | serial (?) | غير مؤكد | غير مؤكد | low |
| Roche cobas e 601 / e 801 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Abbott ARCHITECT c4000 / c8000 / i1000SR / i2000SR | astm | serial (?) | غير مؤكد | غير مؤكد | low |
| Abbott Alinity c / Alinity i | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Beckman Coulter Access 2 / UniCel DxI 600 / DxI 800 (LIS vendor info doc C03112) | astm | serial 9600 8N1 | غير مؤكد | غير مؤكد | high |
| Beckman Coulter AU480 / AU680 / AU5800 (Olympus AU400/640 lineage) | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Olympus (Beckman) AU400 / AU640 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Siemens Healthineers Dimension EXL / RxL | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Siemens Healthineers Atellica CH | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Siemens Healthineers Immulite 1000 / 2000 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Siemens Healthineers ADVIA Centaur XP / Atellica IM | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Siemens Healthineers RAPIDPoint 400/500 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Siemens Healthineers DCA Vantage | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Mindray BS-120 / BS-200E | hl7 | TCP (role ?) | غير مؤكد | غير مؤكد | medium |
| Mindray BS-240 / BS-240Pro / BS-300 / BS-330E | hl7 | TCP (role ?) | غير مؤكد | غير مؤكد | low |
| Mindray BS-400 / BS-600 / BS-800 / BS-2000 | hl7 | TCP (role ?) | غير مؤكد | غير مؤكد | low |
| Erba Mannheim XL-200 / XL-300 / XL-640 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Erba Mannheim EM 200 (electrolyte) | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Biosystems BA200 / BA400 / A15 / A25 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Dirui CS-300 / CS-400 / CS-600 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Urit 8021 / 8030 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Human HumaStar 100/200/600 / HumaLyzer | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Ortho (Vitros) 350 / 5600 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Vital Scientific / ELITech Selectra Pro | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche Cobas Mira | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Snibe Maglumi 600 / 800 / 2000 / 4000 (Plus) | astm | TCP (role ?) | غير مؤكد | غير مؤكد | low |
| Mindray CL-900i / CL-1000i / CL-2000i | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| bioMerieux Mini VIDAS / VIDAS 3 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| DiaSorin LIAISON / LIAISON XL | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Fujirebio Lumipulse G | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Bio-Rad / DIESSE iMark / Chorus | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Thermo Multiskan FC / GO | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Dynex DS2 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Human HumaReader HS | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Mindray MR-96A / DNM-9602 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche cobas b 121 / b 221 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche (AVL) AVL 9180 / electrolyte | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Medica EasyLyte / EasyStat | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Radiometer ABL80 / ABL90 / ABL800 FLEX | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Abbott i-STAT 1 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Tosoh G8 / G11 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Bio-Rad D-10 / VARIANT II | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Arkray ADAMS A1c | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Roche cobas b 101 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Abbott Afinion 2 | غير مؤكد | غير مؤكد | غير مؤكد | غير مؤكد | low |
| Tosoh AIA-360 / AIA-900 | astm | serial 9600 8N1 | غير مؤكد | غير مؤكد | medium |
| Roche cobas Liat | hl7 | TCP (instrument-is-client) | غير مؤكد | غير مؤكد | high |

ملاحظة: "غير مؤكد" في الجدول = لم أجد مصدراً. الفراغ في الـ JSON يُمثَّل بـ `null`/`[]`.

## 4. عائلات الواجهات

### 4.1 ASTM تسلسلي (E1381 / E1394 = CLSI LIS1-A / LIS2-A) — Roche cobas c 311، Beckman Access/DxI، Tosoh AIA-360

**الإطار (من دليل Beckman C03112-AF)**
- جلسة: المرسل يرسل `<ENQ>`، المستقبل `<ACK>`، ثم إطارات `<STX> رقم_إطار(0-7) نص <CR> <ETX> CC <CR><LF>` وكل إطار يُرد عليه بـ `<ACK>` (أو `<NAK>` للإعادة)، وينتهي بـ `<EOT>`.
- الـ checksum: مجموع بايتات (رقم الإطار + النص + ETX/ETB) modulo 256 مكتوباً بحرفي hex كبيرين. تحققتُ من المثال المنشور (`...20111231235959<CR><ETX>20`) = `20`.
- مهلات Beckman: 15 ثانية بعد ENQ؛ عند NAK/عدم الجاهزية ينتظر 10 ثوانٍ ثم يعيد ENQ؛ عند تصادم ENQ يتأخر المضيف ثانية.
- الإطار الأقصى 240 بايت نص (ETB لإطار وسيط)؛ Roche c 311: طول الإطار 247 بايت.
- حروف التحكم ممنوعة داخل النص (SOH, STX, ETX, EOT, ENQ, ACK, DLE, NAK, SYN, ETB, LF).
- المحددات `|\^&` (حقل | تكرار \ مكوّن ^ هروب &). **تنبيه:** نص دليل c 311 كما استخرجتُه يعرض `H|^&` دون `\` — على الأغلب فقد الاستخراج الشرطة المائلة؛ يجب التأكد من الالتقاط الحقيقي.
- سجلات: H (header) → P (patient) → O (order) → R (result) → C (comment) → L (terminator)، وQ لاستعلام المضيف (host query).

**الفيزيائي**
| الجهاز | الإعدادات | المصدر |
|---|---|---|
| Roche cobas c 311 | RS-232C، 19200/9600/4800 (موصى 9600)، 8 بت/بدون parity/1 stop موصى، ويمكن 7E1 وغيرها (8 تركيبات)، نصف مزدوج، منفذ واحد، كابل ≤15م، "Protocol Type: cobas type" | دليل Host Interface v1.3 |
| Beckman Access 2 / DxI | DB-9 ذكر (DTE) → يلزم كابل null modem؛ 8N1 ثابت؛ baud افتراضي 9600 (1200–19200) | C03112-AF |
| Tosoh AIA-360 | DB-9 أنثى على الجهاز؛ 1200–19200؛ 7/8 بت؛ parity E/O/N؛ 1/2 stop (القيم "القياسية" غير مقروءة في الاستخراج) | AIA-360 Spec Rev.6 |

**اتجاه البيانات**
- c 311: ثنائي الاتجاه (Q ثم رد `TSDWN^REPLY` ثم رفع النتائج `RSUPL^REAL`). التحميل الدفعي `TSDWN^BATCH`.
- Beckman: ثنائي (Q ثم O بحقل action `A`)؛ وضع الإرسال "LIS Send Mode": بحسب الحاوية/النتيجة/الاختبار.
- AIA-360: رفع نتائج فقط (سجل Q "Not used").

**المصادقة:** لا يوجد (وصلة نقطة لنقطة). حقل Password في H يتجاهله Beckman. لا تعتمد عليه.

**مفاتيح العينة:** c 311: Specimen ID في حقل O-3 (13 أو 22 حرفاً) وموقع الرف في O-4 (`تسلسل^رف^موضع^^نوع_عينة^حاوية`)؛ في وضع S.No يصبح O-3 تعليقاً. Beckman: Specimen ID في O-3 بطول 15. AIA: 16.
**الـ QC:** c 311 يرسل `O` بحقل action `Q` ومعرّف العينة = اسم/لوط الـ control. Beckman: أكواد تعليق QC مثل `QCF` (خارج الحدود) و`QEX` (منتهي).
**أكواد الاختبار:**
- c 311: `^^^<ApplicationCode>^<Dilution>`؛ الرقم ≤5 أرقام؛ ضوئي 1–910، ISE: Na=989 K=990 Cl=991، مؤشرات المصل L/H/I = 992/993/994، محسوبة 961–968. جدول "رقم → تحليل" **غير موجود** في الدليل: يُصدَّر من الجهاز.
- Beckman: اسم نصي مثل `TSH3`, `Ferritin`, `FOLW` (الجدول الكامل في ملحق B وقد نسخت أهم 28 إلى JSON).
- AIA-360: رقم (001...) يخصصه المعمل.

**ملاحظات تنفيذية للمحوّل:**
1. ضع مهلات ACK/ENQ وفق الجدول أعلاه. 2. عالج `NAK` بإعادة الإرسال (حد 6 مرات بحسب LIS1-A). 3. لا تفترض ترتيب P/O/R؛ بعض الأجهزة ترسل عدة O لنفس P. 4. حقل النتيجة قد يكون `قيمة^نص` (Beckman: `0.24^Non-React.`) أو `-1^0.303` (c 311 كمي).

### 4.2 Abbott ARCHITECT / Alinity
مصدر وحيد: إشعار تنظيمي برازيلي (ICIJ) يفيد بأن "ARCHITECT Standard RS-232 Interface Manual" يحدد حقل النتيجة (10.1.4) بـ 15 حرفاً بينما الجهاز (برنامج ≥ 2.00) قد يرسل حتى 20. أي **حقل النتيجة يجب أن يقبل 20 حرفاً**. بالإضافة إلى ذكر "serial RS-232 bidirectional مع Host Query option". لم أجد: baud، TCP، أرقام الـ assays. اطلب الدليل من Abbott.

### 4.3 Mindray BS (HL7 2.3.1 على TCP/IP — مؤكد جزئياً)
ملخص بحث لدليل "BS-200 Host Interface Manual v1.2" (يغطي BS-120/130/180/200/220): TCP/IP + HL7 2.3.1، ثنائي الاتجاه (إرسال نتائج وتنزيل بيانات عينة). لم أستطع فتح الدليل نفسه (حجب Cloudflare/مواقع نسخ)، لذا **لا أعرف** الـ port ودور الجهاز (client/server) ولا أسماء OBX. منتدى مستخدم يقول إن BS-200 به منفذ تسلسلي لا RJ45 (تعارض!). إطار MLLP القياسي: `<VT>`(0x0B) + الرسالة + `<FS>`(0x1C) + `<CR>`(0x0D) — موثق في مرجع HL7 العام وفي دليل cobas Liat.
العينة في الـ JSON هي توضيح لإطار MLLP فقط ومحتوى OBX فيها placeholder.

### 4.4 Roche cobas Liat (HL7 2.5 MLLP — مرجع موثق)
الجهاز دائماً TCP client؛ المضيف يستمع على أي port ويُضبط IP/port في الجهاز؛ ORU^R30؛ لا مصافحة ولا checksum. قد يدعم TLS في الإصدارات الأحدث. مفيد كمرجع HL7/MLLP لا كجهاز كيمياء.

### 4.5 باقي الأجهزة
Siemens (Dimension, Atellica, Immulite, Centaur)، Erba، Biosystems، Dirui، Urit، Human، Vitros، Selectra، Snibe Maglumi، Mindray CL، VIDAS، LIAISON، Lumipulse، قارئات ELISA، أجهزة الغازات/الإلكتروليتات، HbA1c وPOCT: **لم أجد وثيقة واجهة قابلة للفتح**. أي معلومة عنها هنا = `غير مؤكد — اسأل المورد`. ملاحظات:
- Siemens: إشعار أمان 2019 (Swissmedic) يذكر واجهة ASTM مع رسالتي خطأ "LIS Connection Lost (412)" و"LIS communication Error (224)" عند تزامن host query مع نتيجة (لم أحدد الجهاز).
- Snibe Maglumi: مناقصة تذكر "ASTM bidirectional" لـ Maglumi 800؛ مستند "Network Interface Specification" (Maglumi 4000 Plus) موجود على Scribd لكن لم يفتح.
- Bio-Rad D-10: يصدّر ملفاً/USB/مجلد شبكي ولا يوجد دليل على ASTM تسلسلي في المصادر المفتوحة.
- Radiometer ABL: فصل "Interfacing facilities" في ABL80 FLEX Reference Manual (Ed. K) لدى bioclinicalservices.com.au — لم يفتح.
- Quidel Triage MeterPro (خارج النطاق) يثبت أن أجهزة POCT قد تكون تسلسلية أحادية الاتجاه 9600 8N1.

## 5. جداول أكواد الاختبارات

- `beckman-access2-dxi`: 28 كوداً موثقاً (ملحق B، C03112-AF) مع LOINC مقترح.
- `roche-cobas-c311`: ISE فقط موثق (989/990/991)، والبقية "رقم يخصصه المعمل".
- LOINC المقترحة مأخوذة من معرفتي العامة لا من المصدر — **راجعها** مقابل نوع العينة/الطريقة (مثلاً vitamin D، troponin، LDL محسوب/مباشر).
- لم أملأ جدول الـ 40 اختباراً الكيميائية الشائعة (glucose, urea, ALT...) لأي جهاز لأن أرقام القنوات تتعلق بتهيئة كل معمل ولم أجد جداول منشورة.

## 6. قائمة أسئلة المورد (لكل جهاز)

الأسئلة العامة لكل جهاز (مفصّلة لكل جهاز في حقل `askVendor`):
1. هل خيار/ترخيص LIS (Host interface) مفعّل؟ التكلفة؟ هل يلزم زيارة مهندس؟
2. دليل Host Interface / LIS Specification لنسخة السوفتوير المركبة (PDF).
3. البروتوكول (ASTM/HL7) + النقل (serial/TCP) + إعدادات baud/parity أو IP/port + من يبدأ الاتصال.
4. هل الجهاز يدعم Host Query؟ وكيفية ضبط "Send mode".
5. جدول أكواد الاختبارات الفعلي وتصديره من الجهاز + الوحدات (SI أم conventional).
6. كيفية إرسال QC وإعادة الفحص (rerun) والتخفيف (dilution) والنتائج المحسوبة.
7. كابل serial (pinout/ null modem) أو معلومات الشبكة؛ هل يلزم وسيط (middleware) من الشركة (cobas infinity، Remisol، Data Innovations...)؟
8. هل يوجد وضع محاكاة/ملف trace يمكن التقاطه للاختبار؟ (Roche: Communication Trace على الجهاز).

أسئلة خاصة: Mindray BS (هل HL7 أم ASTM؟ port؟ client/server؟)، Architect (TCP؟ assay numbers؟ 20 حرفاً)، c 111/501/503/6000/8000 (هل نفس c 311؟)، e 411/e 601/e 801 (جدول Test Numbers)، Maglumi (Network spec)، Tosoh AIA-900 (host query؟).

## 7. تحفظات

- لم يُلتقط أي شيء من جهاز حقيقي. عينات "manufacturer-documented" هي نصوص الدليل كما هي (سجلات فقط حين لا يظهر الدليل الإطار).
- في دليل Beckman مثال Q بـ checksum `15` بينما حسابي `14` — خطأ مطبعي محتمل في الدليل؛ لا تعتمد على الأرقام المطبوعة، احسبها.
- نسخ الأدلة التي قرأتها قديمة أو من مواقع ثانوية (slideshare لدليل c 311 عام 2011؛ AIA-360 قديم) — قد تختلف النسخ الحديثة.
- مواقع (pdfcoffee, studylib, scribd) حجبت الوصول لعدة أدلة؛ لذا الثقة منخفضة لمعظم الأجهزة.
- لا مصادقة في ASTM/HL7 الأساسي؛ إن استُخدمت شبكة فقيّد الوصول بجدار ناري/IP allow-list، ولا تعرّض المنفذ للإنترنت.
- التقسيم بين "شائع/متوسط/نادر" تقدير وليس بيانات مبيعات.
