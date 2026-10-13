# مرجع ربط الأجهزة بنظام المعمل (LIS) — البروتوكولات والعتاد

> مرجع لمطوري A.Y Scan. الشرح بالعربية والمعرّفات التقنية بالإنجليزية.
> تاريخ الإعداد: 2026-10-13. كل معلومة مصنفة: **[sourced]** لها رابط، **[anecdotal]** خبرة شائعة بلا مصدر موثق، **[general-knowledge]** معرفة هندسية عامة لم يتم التحقق منها من مصدر في هذه الجلسة، **[unverified]** لم نستطع التأكد.
> التفاصيل لكل موديل (hematology / coag / urine / chemistry / immunoassay) موجودة في الملفات الشقيقة في `docs/devices/` ولا تتكرر هنا.
> الملف المصاحب: `docs/devices/data/test-mapping-template.json`.

---

## 1. نظرة على السوق المصري / الشرق الأوسط

### 1.1 ما الذي أمكن توثيقه فعلاً

| المعلومة | الحالة | المصدر |
|---|---|---|
| Sysmex أنشأت فرعاً مباشراً في القاهرة (إعلان 2018) بعد البيع عبر موزعين محليين؛ الخطة: hematology ثم urinalysis و hemostasis | sourced (قديم، قد يكون تغير) | https://www.sysmex.co.id/sysmex-establishes-subsidiary-in-egypt-and-begins-conducting-direct-sales-and-services/?lang=id |
| Siemens Healthineers لها مكتب في القاهرة (Maadi Technology Park حسب دليل شركات)، وأتمتة معملية FLEXLAB-X في Al Mokhtabar (Mega Lab) | sourced | https://www.zawya.com/company/5090831415/siemens-healthin ، https://www.zawya.com/en/press-release/companies-news/al-mokhtabar-and-siemens-healthineers-launch-first-flexlab-x-total-lab-automation-track-in-mea-at-the-mega-lab-402119 |
| Mindray وقّعت اتفاق تعاون استراتيجي مع هيئة الرعاية الصحية المصرية (أغسطس 2024) — اتفاق حكومي وليس تعيين موزع | sourced | https://equalocean.com/news/2024082621092-mindray-signs-strategic-cooperation-agreement-egypt-healthcare-authority |
| تقييم Mindray BC-6800 Plus مقابل Sysmex في معمل مستشفى أطفال بمصر (دليل على الاستخدام لا على القناة) | sourced (ثانوي) | https://www.abacusdx.com/?p=53028 |
| Clinilab (تأسست في القاهرة 1982) تورّد أجهزة chemistry/immunoassay أوتوماتيكية — العلامات التي تمثلها غير مذكورة | sourced جزئياً | https://mtec-sc.org/life-sciences/clinilab |
| Bardissi Medical: استيراد وتوزيع أجهزة تشخيص ومعامل منذ 1970 (حسب ملف منظمة) — العلامات غير مؤكدة | sourced جزئياً | https://www.developmentaid.org/organizations/view/452257/bardissi-medical |
| BM-Egypt (Bagneid Group) — الدقي، القاهرة، تشخيص معملي (ملف مولّد آلياً، يحتاج تحقق) | unverified | https://intuitionlabs.ai/companies/medtech/bm-egypt-for-medical-scientific-equipment-s-a-e-bagneid-group |
| Erba/Transasia: الموزع الحصري الإقليمي المذكور عام 2013 كان في دبي وليس مصر | sourced (قديم) | https://biospectrumindia.com/news/95/6617/transasias-subsidiary-erba-diagnostics-mannheim-gmbh-fortifies-its-presence-in-the-middle-east.html |
| Ibnsina Pharma وقّعت شراكة استيراد/توزيع مع Roche Egypt (2019) — يخص الأدوية وليس بالضرورة أجهزة التشخيص | sourced (لا تعتمد عليه لأجهزة cobas) | https://www.ibnsina-pharma.com/?p=1407 |

### 1.2 ما لم نستطع توثيقه (لا تفترضه)
- وكلاء Roche Diagnostics و Abbott و Beckman Coulter و Biosystems و Human و Snibe و Diasorin داخل مصر: **لم نجد مصدراً**. اسأل الشركة المصنعة مباشرة أو صفحة "distributors/where to buy" الرسمية، أو اطلب من المعمل عقد الصيانة الحالي (فيه اسم الوكيل ورقم الدعم).
- أي ترتيب لـ "أكثر الأجهزة انتشاراً" في المعامل المصرية، أو حصص المناقصات: **anecdotal / unverified**. لم نجد دراسة سوق منشورة موثوقة. الاستنتاج الوحيد المسنود: العلامات الكبرى (Sysmex, Siemens, Mindray) حاضرة فعلاً في مصر بحسب المصادر أعلاه؛ والأجهزة متوسطة الحجم من Erba/Biosystems/Human/Snibe شائعة في الخبرة العملية بشرق أوسط (**anecdotal**).
- تحقق عملياً من جهاز كل عميل بدلاً من الاعتماد على هذا الجدول: اطلب صورة لوحة الجهاز (model / serial / software version).

### 1.3 المصادر الرسمية لتسجيل الأجهزة (للتأكد من الوكيل المعتمد)
- هيئة الدواء المصرية EDA: التسجيل إلزامي للأجهزة الطبية منذ 2018؛ المصنّع الأجنبي بلا وجود محلي يعيّن "Egyptian Registration Holder" (موزع أو مكتب علمي مرخص). إعلان تسهيلات إجراءات بتاريخ 12 فبراير 2026. المصدر: https://edaegypt.gov.eg/en/media-center/announcements/announcement-about-the-facilitation-of-certain-registration-procedures-for-medical-devices/ و https://www.trade.gov/market-intelligence/egypt-registration-medical-devices
- تصنيف أجهزة المعامل (IVD) وأي متطلبات إضافية: **unverified — راجع الجهة المختصة (EDA)**.

### 1.4 مشاكل شائعة (كلها anecdotal ما لم يُذكر مصدر)
1. **جهاز مستعمل / رمادي (grey-market):** قد لا يكون له وكيل، ولا يمكن الحصول على وثيقة بروتوكول LIS أو كلمة سر قائمة الخدمة (service menu). النتيجة: لا يمكن تفعيل خيار host communication.
2. **ترخيص LIS/Host interface:** بعض الأجهزة تتطلب "option" أو مفتاح ترخيص مدفوع لتفعيل الاتصال ثنائي الاتجاه (bidirectional). اسأل الوكيل قبل الوعد للعميل بالربط. (general-knowledge)
3. **إصدارات firmware/software:** نفس الموديل يغيّر شكل الحقول بين الإصدارات؛ سجّل رقم الإصدار في سجل الجهاز في النظام واحفظ عينة رسائل لكل إصدار.
4. **البروتوكول غير موثق:** اطلب "LIS Interface Specification" من الوكيل كتابةً؛ لا تعتمد على الهندسة العكسية وحدها.
5. **كابل / محول USB-serial رخيص** (انظر القسم 3.3) هو أول سبب لأعطال "لا بيانات".
6. **أسماء المرضى بالعربية:** معظم الأجهزة لا تدعم UTF-8 في حقول المريض (انظر 2.5) — خطط لإرسال ID فقط.
7. **الساعة:** ساعة الجهاز غير مضبوطة تُنتج أوقاتاً خاطئة (انظر 3.7).

---

## 2. دليل البروتوكولات للمطور

### 2.1 ASTM E1381 (الطبقة الدنيا، تُعرف أيضاً CLSI LIS01-A2)

الوثائق: ASTM E1381-02 (سحبت من المتجر — راجع النسخة المعتمدة): https://store.astm.org/e1381-02.html . نسخة 95 للاطلاع: https://standards.iteh.ai/catalog/standards/astm/7645200a-2db8-43d9-a331-ff33690fa984/astm-e1381-95 . CLSI LIS01-A2 موجودة في قوائم FDA للمعايير المعترف بها (مذكور في نتائج بحث CLSI أدناه). **لم نحصل على نص المعيار الكامل**؛ القيم أدناه مأخوذة من وثائق موردين تقتبس المعيار، والجهاز الفعلي هو المرجع.

**رموز التحكم (ASCII):**

| الرمز | Hex | الاستخدام |
|---|---|---|
| ENQ | 0x05 | طلب بدء جلسة (establishment) |
| ACK | 0x06 | موافقة / استلام سليم |
| NAK | 0x15 | رفض / مشغول / frame تالف |
| EOT | 0x04 | إنهاء الجلسة |
| STX | 0x02 | بداية frame |
| ETX | 0x03 | نهاية frame أخير |
| ETB | 0x17 | نهاية frame وسيط (السجل أطول من حد الـ frame) |
| CR | 0x0D | نهاية السجل (record) وجزء من نهاية الـ frame |
| LF | 0x0A | آخر بايت بعد الـ checksum |

مصدر وصف ETB/ETX/ACK/CR/LF/frame number: https://www.medplum.com/docs/agent/astm-channels ، ومصدر الحد 240 حرفاً: وثائق Horiba Pentra (مقتبسة في بحث، https://www.scribd.com/document/554954128/ML ) — لذلك نعتبره **sourced جزئياً**.

**ثلاث مراحل:** (1) Establishment: المرسل يرسل ENQ، المستقبل يرد ACK (جاهز) أو NAK (مشغول) أو ENQ (تنازع contention). (2) Transfer: frames متتالية، كل واحد يُرد عليه ACK/NAK. (3) Termination: المرسل يرسل EOT.

**شكل الـ frame:**
```
<STX> FN  text(≤240 chars)  <ETB|ETX>  C1 C2  <CR><LF>
```
- `FN`: رقم الـ frame رقم ASCII واحد، يبدأ 1 ثم يزيد حتى 7 ثم يعود إلى 0 (general-knowledge، يتفق مع مثال Medplum أن أول سجل يسبقه رقم).
- حد النص 240 حرفاً: ما زاد يُقسّم، الوسيط ينتهي بـ ETB والأخير بـ ETX (sourced جزئياً أعلاه).
- **Checksum:** مجموع البايتات من FN حتى ETX/ETB شاملاً (بدون STX) mod 256، يُكتب hex كبير من حرفين (C1C2). (general-knowledge؛ المثال أدناه محسوب بهذه القاعدة.)

**Timeouts (من وثائق موردين تقتبس E1381-95؛ تحقق من وثيقة جهازك):**
- المرسل بعد ENQ ينتظر ACK/NAK/ENQ خلال **15 ث** وإلا timeout → termination. بعد NAK ينتظر ≥ **10 ث** قبل ENQ جديد.
- المستقبل في مرحلة transfer: **30 ث** بدون frame أو ENQ → timeout.
- Contention: عند تبادل ENQ، **الجهاز (instrument) له الأولوية**؛ الطرف الأقل أولوية (LIS) ينتظر ENQ الجهاز حتى **20 ث**؛ صاحب الأولوية يعيد ENQ بعد حوالي **1 ث**.
- المصادر: Cepheid LIS spec https://infomine.cepheid.com/sites/default/files/2025-02/302-2261,%20Rev.%20F%20LIS%20Protocol%20Specification.pdf ؛ Beckman LIS Vendor Info https://www.beckmancoulter.com/download/file/wsr-228138/C03112AF?type=pdf ؛ Thermo IDM/Prime https://www.bikalims.org/downloads/instrument-interface-specifications/thermo-fisher-astm . بعض الموردين يستخدمون 15 ث في transfer بدل 30 ث (Beckman) — **قيم المعيار مقابل الجهاز تختلف؛ اجعل المهلات قابلة للضبط لكل جهاز**.

**سلوك المستقبل (LIS) المطلوب:**
1. ENQ → رد ACK (إذا لم يكن مشغولاً).
2. لكل frame: تحقق من FN المتوقع + checksum → ACK أو NAK. إذا FN مكرر (إعادة إرسال بعد فقدان ACK) فأرسل ACK ولا تعالج السجل مرة ثانية.
3. تجميع نص الـ frames الوسيطة (ETB) حتى ETX.
4. EOT → أغلق الجلسة وحلل الرسالة H..L كوحدة.
5. ملاحظة: وكيل Medplum لا يُرسل NAK إطلاقاً ولا يتحقق من الـ checksum (مصدر: صفحة Medplum أعلاه) — لا تعتمد على أداة وسيطة تفعل ذلك؛ نفّذه في المحوّل.

### 2.2 ASTM E1394 / CLSI LIS2-A2 (طبقة الرسائل)

مرجع: ASTM E1394 (الأصلي)، الاسم الحالي CLSI LIS02-A2 / LIS2-A2. **لم نحصل على نص المعيار**؛ التخطيط أدناه معرفة عامة ومتسقة مع مثال Medplum وأمثلة الموردين.

**المحددات** (تُعرّف في حقل H الثاني): `|` field، `\` repeat، `^` component، `&` escape. أي `H|\^&`.

**السجلات (كل سجل ينتهي بـ CR، والهرمية: H > P > O > R/C):**

| سجل | الاسم | ملاحظات للمطور |
|---|---|---|
| H | Header | يحدد المحددات، sender name (H.5)، processing ID (P/T/D)، version (H.13 غالباً `1`)، timestamp |
| P | Patient | P.2 sequence، P.3 practice patient ID، P.4 lab patient ID، P.6 الاسم `Last^First`، P.8 تاريخ الميلاد، P.9 الجنس |
| O | Order | O.2 seq، **O.3 Specimen ID (الباركود)**، O.4 instrument specimen ID، **O.5 Universal Test ID** `^^^CODE^dilution` ، O.6 priority (R/S)، O.12 action code، O.26 report type (F/X/Q...) |
| R | Result | R.2 seq، **R.3 Universal Test ID**، **R.4 value**، R.5 units، R.6 reference range، **R.7 abnormal flag**، R.9 result status (F=final, P=prelim, C=correction, X=cannot be done)، R.11 operator، R.13 completed timestamp |
| C | Comment | تعليق مرتبط بآخر سجل |
| M | Manufacturer info | خاص بالمصنع |
| Q | Request (query) | `Q.3` starting range `^SAMPLEID` ، Q.5 Universal Test ID أو `ALL`، Q.13 status |
| L | Terminator | `L|1|N` (N=normal termination) |

(مواقع الحقول من LIS2-A2 كما هي في المعرفة العامة؛ **راجع وثيقة الجهاز لأن بعض الموردين يملؤون حقولاً مختلفة**.)

**تدفق host query (الجهاز يسأل عن طلبات الباركود):**
1. الجهاز يقرأ الباركود → ENQ → يرسل `H` + `Q|1|^SAMPLEID||^^^ALL...` + `L`.
2. LIS يرد ACK لكل frame، ثم (بعد EOT) **يبدأ هو جلسة جديدة** (ENQ) ويرسل `H`, `P`, `O` (واحد لكل اختبار أو مجمّع)، `L`. إذا لا يوجد طلب: يرسل O مع action code أو رسالة بلا O حسب وثيقة الجهاز.
3. الجهاز يجري الاختبار ويرسل `H, P, O, R..., L`.

**Worklist download (دفع):** LIS يرسل أوامر مسبقاً بلا طلب من الجهاز (إذا دعم الجهاز). الجهاز قد يخزنها أو يتجاهلها.

#### مثال 1 — نتيجة ASTM `reconstructed-from-spec`
المرجع: https://store.astm.org/e1381-02.html + https://www.medplum.com/docs/agent/astm-channels . القيم **مخترعة** والـ checksum محسوب بالقاعدة أعلاه؛ حقول الجهاز الحقيقي تختلف. الرموز: `<STX>`=0x02، `<CR>`=0x0D، `<ETX>`=0x03، `<LF>`=0x0A.

```
<ENQ>                                  instrument -> LIS
<ACK>                                  LIS -> instrument
<STX>1H|\^&|||SampleHost^1.0|||||LIS||P|1|20261013101500<CR><ETX>C1<CR><LF>
<ACK>
<STX>2P|1||PID12345||Test^Patient||19800101|M<CR><ETX>33<CR><LF>
<ACK>
<STX>3O|1|S000123||^^^GLU|R|20261013100000|||||||||||||||||||F<CR><ETX>A2<CR><LF>
<ACK>
<STX>4R|1|^^^GLU|95|mg/dL|70-110|N||F||||20261013101000<CR><ETX>25<CR><LF>
<ACK>
<STX>5L|1|N<CR><ETX>08<CR><LF>
<ACK>
<EOT>
```
(الاتجاه في المثال تعليمي — في الواقع الجهاز هو المرسل لكل frames النتيجة.)

### 2.3 HL7 v2.x فوق TCP (MLLP)

- **MLLP framing:** `0x0B` + رسالة HL7 + `0x1C` + `0x0D`. لا طول، لا checksum، لا session. يجب البحث عن الزوج `0x1C 0x0D` وليس `0x0D` وحدها لأن CR هو فاصل الـ segments داخل الرسالة. مصادر: https://hexdocs.pm/hl7v2/HL7v2.MLLP.html ، https://mllp-server.aktagon.com/articles/mllp-framing-bytes/ . المرجع الرسمي (لم نقرأه): HL7 MLLP transport spec / Appendix C — **راجع HL7**.
- **الفواصل:** segment = CR (`\r`)؛ field `|`؛ component `^`؛ repeat `~`؛ escape `\`؛ sub-component `&`. (MSH.2 = `^~\&`).
- **أهم الرسائل في المعمل:**

| الرسالة | الغرض |
|---|---|
| `ORU^R01` | نتائج من الجهاز (الأكثر شيوعاً) |
| `ORM^O01` | طلب (order) من LIS للجهاز |
| `OML^O33`, `OUL^R22` | order/ result بحسب IHE LAW (أحدث، specimen-oriented) |
| `QRY^Q02` / `QBP^Q11` / `QBP^Q22` | الجهاز يسأل عن طلبات الباركود (query) |
| `ACK` | `MSA|AA|<MSH.10 of original>` قبول، `AE` خطأ تطبيق، `AR` رفض |

- **MSH:** MSH.3 sending app، MSH.4 sending facility، MSH.5/6 receiving، MSH.7 timestamp، MSH.9 message type، **MSH.10 message control ID** (استخدمه كمفتاح idempotency)، MSH.11 processing ID (P/T/D)، MSH.12 version، MSH.18 character set (مثلاً `UNICODE UTF-8` أو `8859/1`).
- **OBX:** OBX.2 value type (`NM` رقم، `ST` نص، `TX`، `CE/CWE` كود، `SN` structured numeric مثل `>^100`)، OBX.3 observation ID (كود الجهاز أو LOINC)، OBX.5 value، OBX.6 units (UCUM أو نص حر)، OBX.7 reference range، **OBX.8 abnormal flags**، OBX.11 result status (F/P/C/X).
- **Abnormal flags (جدول HL7 0078):** H، L، HH، LL (حرج)، N، A، `>` `<` (خارج المدى القابل للقياس)، POS/NEG، DET/ND... المصدر: https://hl7.org/fhir/R4/v2/0078/index.html (الجدول مصنف deprecated بعد v2.8.2 لكنه ما زال الشائع في الأجهزة).
- **ACK:** يجب رد ACK مؤطر بـ MLLP على كل رسالة؛ بدون ACK قد يعيد الجهاز الإرسال ⇒ تكرار نتائج (انظر idempotency).

#### مثال 2 — ORU^R01 `reconstructed-from-spec`
المرجع: https://hexdocs.pm/hl7v2/HL7v2.MLLP.html (التأطير) والبنية العامة لـ HL7 v2. القيم مخترعة. كل سطر ينتهي بـ `\r`.
```
<VT>MSH|^~\&|ANALYZER1|LAB|AYSCAN|CLINIC|20261013101500||ORU^R01|MSG0001|P|2.5.1|||||||UNICODE UTF-8
PID|1||PID12345||Test^Patient||19800101|M
OBR|1|S000123||GLU^Glucose|||20261013100000
OBX|1|NM|GLU^Glucose||95|mg/dL|70-110|N|||F|||20261013101000
<FS><CR>
```
رد LIS:
```
<VT>MSH|^~\&|AYSCAN|CLINIC|ANALYZER1|LAB|20261013101501||ACK^R01|ACK0001|P|2.5.1
MSA|AA|MSG0001
<FS><CR>
```

### 2.4 سلوك الجهاز: عميل أم خادم TCP؟
(general-knowledge — يختلف بين الموديلات، راجع كل ملف جهاز.)
- كثير من الأجهزة تعمل **TCP client**: هي تتصل بـ IP/Port الخاص بالـ LIS ⇒ يجب أن يستمع A.Y Scan (listener) على منفذ ثابت لكل جهاز.
- أجهزة أخرى تعمل **TCP server**: الـ LIS هو من يتصل (client) بـ IP:port الجهاز ⇒ المحوّل يجب أن يعيد الاتصال تلقائياً.
- بعض الأجهزة تفتح اتصالاً جديداً لكل رسالة وتغلقه؛ وبعضها تُبقيه مفتوحاً. صمّم لكلا الحالتين.
- **Keep-alive/reconnect:** فعّل TCP keep-alive (`socket.setKeepAlive(true, 30000)`)، وقاعدة إعادة اتصال بـ exponential backoff (مثلاً 1-2-5-10-30 ث)، ومؤقت خمول (idle) لاكتشاف الاتصال الميت؛ لا تفترض أن close حدث (قد يموت الاتصال بصمت عند فصل الكابل).
- منفذ واحد لكل جهاز يبسّط تحديد المصدر (لا تعتمد على IP فقط لأنه قد يتغير).
- عند المحول serial-to-Ethernet: نفس الشيء، الجهاز "يتحدث serial" والمحوّل هو TCP client أو server حسب ضبطه (القسم 3.4).

### 2.5 الترميز (Encoding)
- ASTM فوق serial: ASCII 7-bit في المعيار؛ أي بايت ≥ 0x80 (حرف عربي) قد يكسر الـ checksum أو الأجهزة. بعض الأجهزة تقبل Windows-1256 أو UTF-8 في الاسم، وأغلبها لا. (general-knowledge — اختبر لكل جهاز)
- **التوصية:** لا ترسل الاسم العربي للجهاز؛ أرسل patient ID/Specimen ID فقط (أو اسماً لاتينياً مبسطاً). المرجع الوحيد للاسم هو قاعدة بيانات A.Y Scan.
- HL7: MSH.18 يحدد الـ charset؛ تحقق من القيمة التي يرسلها الجهاز وفكّ بحسبها. خزّن الرسائل الخام كبايتات لا كنص.
- انتبه لأحرف الـ escape في ASTM/HL7 (`\F\`, `\S\`, `\T\`, `\R\`, `\E\`) في حقول النص.

---

## 3. دليل الاتصال المادي

### 3.1 RS-232 DB9 (general-knowledge)
| Pin | DTE (PC) | الإشارة |
|---|---|---|
| 1 | DCD | |
| 2 | RXD | استقبال |
| 3 | TXD | إرسال |
| 4 | DTR | |
| 5 | GND | أرضي |
| 6 | DSR | |
| 7 | RTS | |
| 8 | CTS | |
| 9 | RI | |

- **Null-modem (crossover):** يُوصَّل TXD↔RXD (2↔3) و GND↔GND (5) على الأقل. مع DCE (مودم) يُستخدم كابل straight.
- معظم أجهزة المعامل المتصلة بـ PC تحتاج **null-modem** لأن كليهما DTE، لكن بعضها يعرّف منفذه كـ DCE ويحتاج straight. القرار من دليل الجهاز، وإلا جرّب الاثنين (آمن كهربائياً في الغالب).
- إعدادات شائعة: 9600 8N1 بلا flow control؛ لكن **القيم يحددها الجهاز** (تُقرأ من قائمة الإعداد). لا تفترض.
- بعض الأجهزة تحتاج hardware handshake (RTS/CTS) أو توصيل DTR/DSR داخل الفيشة — راجع دليل الجهاز.
- أطوال الكابل: معيار RS-232 الأصلي ~15 م عند السرعات المنخفضة؛ عملياً 9600 baud يتحمل أكثر بكابل جيد مغطى؛ فوق 15 م استخدم محول Ethernet قرب الجهاز بدلاً من مد serial طويل. (general-knowledge)

### 3.2 التأريض والعزل
- اجعل الجهاز والـ PC على نفس مصدر التأريض الجيد؛ فروق الجهد بين المآخذ تسبب أخطاء ربما تحرق منفذ serial. استخدم **عازل (isolated) USB-serial** أو محول Ethernet معزول للأجهزة الكبيرة أو الموزعة على دوائر كهرباء مختلفة. (general-knowledge)
- لا توصل/تفصل كابل serial والجهاز مشتغل إن أمكن. UPS للـ PC والجهاز.

### 3.3 محولات USB-to-RS232 على Windows 10/11
- **Prolific PL2303:** توجد رقاقات مقلدة (خصوصاً PL2303HXA المقلد) تسبب **Code 10** في Device Manager مع الـ drivers الجديدة؛ Prolific توصي بـ PL2303HXD أو PL2303TA. المصادر: https://goughlui.com/?p=23678 ، https://www.eevblog.com/forum/reviews/note-how-to-not-get-scammed-with-prolific-(pl2303)-usb-serial-adapters/ ، https://www.mikrocontroller.net/attachment/145688/PL2303_Windows_User_Manual_v1.6.0.pdf . بعض المستخدمين نجحوا بـ driver قديم (3.3.11.152) https://www.51sec.org/2015/12/23/usb-to-serial-cable-driver-issue-on-windows-10/ (**anecdotal**).
- **FTDI (FT232R/FT232H):** الخيار المفضل عملياً عند المهندسين؛ لكن لم نجد في هذه الجلسة مصدراً عن مشكلة FTDI المقلدة، **لذا القول بوجود/عدم وجود مشكلة بالـ drivers الحالية unverified**. اشترِ من موزع معروف.
- أخرى: CH340/CH341 و Silicon Labs CP210x شائعة؛ **لم نتحقق** من موثوقيتها لحزم ASTM الطويلة. اختر كابلاً صناعياً (مثل FTDI-based أو معزول) بدل الأرخص.
- بعد التركيب: افتح Device Manager → Ports وسجّل رقم COM؛ ثبّت رقم COM لتفادي تغييره عند تغيير مقبس USB (Advanced → COM Port Number).
- أوقف power saving لـ USB hub (Device Manager → USB Root Hub → Power Management) لتجنب انقطاع المنفذ.

### 3.4 محولات Serial-to-Ethernet (Device Servers)
- أمثلة: **Moxa NPort 5110** (RS-232 واحد؛ أوضاع: Real COM، TCP Server، TCP Client، UDP، Pair Connection، Reverse Telnet، Ethernet Modem) https://www.moxa.com/product/NPort_5110.htm ، Lantronix (مثل UDS/EDS)، USR-TCP232 (مصادر الشركات الأخيرة **لم نتحقق منها** هنا).
- **الوضع الموصى به: Raw TCP** (TCP Server أو TCP Client)، حيث يتعامل المحوّل مع المنفذ كـ socket خام بدون driver على Windows.
  - الجهاز ⇄ NPort (serial) ⇄ شبكة ⇄ A.Y Scan.
  - **TCP Server mode (على المحول):** A.Y Scan يتصل بـ IP:4001 (افتراضي Moxa 4001 — general-knowledge). مناسب لأن الـ LIS يتحكم بإعادة الاتصال.
  - **TCP Client mode:** المحول يتصل بـ A.Y Scan listener — مناسب حين لا تريد ثقباً/منفذاً على المحول.
  - تحقق من مهلة الخمول وإعدادات `Packet length / Delimiter / Force transmit` لأن المحول قد يقطّع أو يجمّع البايتات (ASTM حساس للتوقيت). مستخدم لاحظ تفكيك الرسالة بايت-بايت في أحد المنتديات (anecdotal). صمم المحلل ليعمل على **تدفق بايتات** لا على حدود الحزم.
- **Real COM / COM redirection:** يثبّت driver يخلق COM افتراضياً؛ يسمح لبرامج قديمة بالعمل. بالنسبة لـ Node: يمكن استخدام `serialport` على هذا COM، لكن **Raw TCP أبسط وأكثر ثباتاً**. (توصية.)
- **ضبط خاص:** ضبط baud/parity/stop/flow في المحول مطابقاً للجهاز تماماً.

### 3.5 الشبكة
- IP **ثابت** للمحول/الجهاز (أو DHCP reservation). وثّقه في سجل الجهاز.
- يفضَّل **VLAN أو شبكة فرعية معزولة للأجهزة الطبية**، ومنع وصولها للإنترنت؛ لا تضع الأجهزة والـ PC العام على نفس الشبكة بلا فصل. المرجع للأمن: CLSI AUTO11 (IT security of IVD systems، الإصدار 3 سبتمبر 2024) https://clsi.org/ (صفحات المعايير في البحث: https://store.accuristech.com/subgroups/17900 ).
- **جدار حماية Windows (للـ listener):**
  ```
  netsh advfirewall firewall add rule name="AYScan Device 1" dir=in action=allow protocol=TCP localport=5001 remoteip=192.168.50.11
  ```
  افتح المنفذ **للـ IP الخاص بالجهاز فقط**. (general-knowledge)
- تأكد أن الاتصال يصل: `Test-NetConnection -ComputerName <ip> -Port <port>` (PowerShell).

### 3.6 مزامنة الوقت
- النتيجة تحمل وقت الجهاز؛ فرق الساعة يسبب ترتيباً خاطئاً/تكراراً/تقارير طبية تبدو غير منطقية. زامن PC عبر NTP (w32time) واضبط ساعة كل جهاز دورياً. خزّن **وقتين**: `deviceTimestamp` و `receivedAt`، واستخدم `receivedAt` للتدقيق. (توصية)

### 3.7 قائمة استكشاف الأعطال

| العرض | الأسباب المحتملة | الإجراء |
|---|---|---|
| لا بيانات إطلاقاً | كابل خاطئ (null vs straight)، COM خاطئ، baud، host communication غير مفعّل بالجهاز، جدار حماية، IP/port، المحول في وضع غير مناسب | جرّب loopback (وصل 2 و3) على المنفذ، راقب bytes بأداة مثل Termite/PuTTY/`socat`، تحقق من `Test-NetConnection` |
| بيانات مشوّهة (garbled) | baud/parity/data bits غير متطابقة، ground ضعيف، كابل طويل، charset | طابق الإعدادات بالضبط، قصّر الكابل، جرّب 8N1 مقابل 7E1 (ASTM قديماً 7E1 في بعض الأجهزة — general-knowledge) |
| checksum errors | قراءة CR/LF/ETX خطأ، إضافة بايتات من المحول، حدود الـ frame، حساب يشمل STX خطأً، بايتات عالية (عربية) | سجّل hex، أعد حساب يدوياً بقاعدة 2.1، عطّل أي تحويل نهايات أسطر |
| ACK timeouts | LIS لا يرد ACK في الوقت (معالجة ثقيلة داخل handler)، رد ACK على بايت خاطئ، اتجاه خاطئ للـ contention | ردّ ACK فوراً قبل أي كتابة قاعدة بيانات؛ راجع المهلات القابلة للضبط |
| نتائج مكررة | الجهاز يعيد الإرسال لأن ACK لم يصله، أو أُعيد إرسال يدوي (re-send) من الجهاز، أو reconnect | idempotency (القسم 4.3) |
| نتائج بلا مريض | الباركود غير قابل للقراءة / عينة خارج النظام | quarantine (القسم 4.4) |
| الاتصال ينقطع بعد ساعات | keep-alive، صيانة switch، sleep للـ USB | keep-alive + reconnect + إيقاف power saving |

---

## 4. توصيات تصميم LIS لـ A.Y Scan

### 4.1 معمارية المحوّلات (Adapters)
```
[Analyzer] --serial--> [USB/serial or NPort] --raw TCP--> [Transport (TCP listener | TCP client | serialport)]
   --> [Framing: ASTM E1381 | MLLP] --> [Parser: ASTM E1394 | HL7 v2 | vendor-specific]
   --> [Raw log store] --> [Mapper (per-device mapping table)] --> [Import service (idempotent)]
```
- **محوّل واحد لكل جهاز** (process/worker منفصل أو class مستقلة) بإعدادات: `deviceId`, `instrumentCode`, `transport` (`tcp-listen`/`tcp-connect`/`serial`)، `host`, `port`, `serialOptions`, `protocol`, `timeouts`, `encoding`.
- الطبقات منفصلة: framing لا يعرف شيئاً عن المحتوى؛ parser لا يعرف شيئاً عن النقل. هذا يتيح replay للرسائل المخزنة بدون عتاد.
- Node: مكتبة `serialport` (https://serialport.io/) للـ serial؛ `net` للـ TCP. (لم نفتح وثائقها في هذه الجلسة — راجعها قبل الاستخدام.)
- Windows: لا ترفع الخادم كـ service بدون اختبار وصول للـ COM وللمنافذ؛ حدد المستخدم الذي يشغّل الخدمة.
- مراقبة الحالة: لكل جهاز `connected/last-seen/last-message-at/error-count` تُعرض في الواجهة.

### 4.2 تسجيل الرسائل الخام (Raw log)
- خزّن **كل بايت** مستلم ومرسل (بالـ hex/base64 + اتجاه + timestamp + deviceId + sessionId) قبل أي تحليل. احتفظ بها كمرجع للتحقيق وإعادة التحليل.
- retention مقترحة: 90 يوماً كاملة (قابل للضبط) ثم أرشفة مضغوطة؛ **حدد المدة بقرار مدير المعمل/الجهة المختصة** (القسم 5).
- لا تسجل الرسائل في ملفات مشاعة بلا صلاحيات (تحوي بيانات مرضى).

### 4.3 استيراد idempotent
- المفتاح: `(deviceId, sampleId, testCode, resultTimestamp)` + `messageControlId` (HL7 MSH.10) أو `(sessionId, frameSeq, recordSeq)` في ASTM. أضف unique index.
- أي إعادة إرسال ⇒ لا تُنشئ نتيجة جديدة؛ إن اختلفت القيمة مع نفس المفتاح ⇒ اعتبرها **تصحيحاً (correction)** وسجّل النسخة القديمة، لا تستبدل بصمت.
- ردّ ACK دائماً بعد حفظ الرسالة الخام (لا بعد المعالجة الكاملة) لتجنب إعادة الإرسال.

### 4.4 سلامة هوية المريض (إلزامية)
- **لا تربط نتيجة بمريض أبداً إذا كان sample ID/barcode غير معروف أو غامضاً.** ضعها في **quarantine/unmatched queue** تُراجع يدوياً بواسطة موظف مخوّل مع سجل تدقيق.
- لا تعتمد على اسم المريض الوارد من الجهاز للمطابقة. الاعتماد على Specimen ID فقط (أو مع patient ID كتحقق ثانٍ). إذا تعارض patient ID للجهاز مع الطلب ⇒ quarantine.
- **اختبارات غير معروفة (unmapped codes):** quarantine أيضاً، مع إشعار؛ لا تتجاهلها بصمت ولا تخمّن.
- لا تنشر نتيجة للمريض تلقائياً قبل مراجعة/اعتماد حسب سياسة المعمل (autoverification قاعدة منفصلة — مرجع CLSI AUTO10 مذكور في فهرس CLSI أعلاه، لم نقرأه).

### 4.5 عينات QC
- فرّق QC عن عينات المرضى: عادةً barcode/ID خاص أو sample type QC في الحقل O/OBR (يختلف حسب الجهاز — **راجع وثيقة كل جهاز**).
- مرر QC إلى جدول `qc_results` منفصل (مستوى/دفعة/اللوط) لا إلى جدول المرضى. إن لم يتعرف المحوّل على أنها QC ⇒ quarantine بدلاً من الإدخال كمريض.
- فعّل قواعد Westgard/Levey-Jennings في طبقة مستقلة (خارج نطاق هذا الملف).

### 4.6 الاختبار بدون عتاد
- **HL7/MLLP:** MLLPong (mock MLLP server مفتوح المصدر) https://mllpong.novalagung.com/ ؛ Google Simulated Hospital (يولد رسائل HL7v2 ويرسلها لـ MLLP host) https://pkg.go.dev/github.com/google/simhospital ؛ IHE Gazelle HL7v2 simulator https://gazelle.ihe-europe.net/node/183 .
- **ASTM:** لم نتحقق من محاكي ASTM مفتوح المصدر محدد؛ **الأسلم كتابة replay script** يعيد تشغيل الرسائل الخام المسجلة مع ENQ/ACK حقيقي. مستودع bitdreamit (ASTM E1381 transmission) ظهر في البحث https://github.com/bitdreamit/bitdreamit-astm-e1381-transmission — لم نراجع جودته.
- **Serial افتراضي:** `socat` (Linux/WSL) لإنشاء pty ⇄ TCP و com0com (Windows، زوج منافذ COM افتراضية) — **لم نتحقق من صفحات المشروعين في هذه الجلسة**؛ هما معروفان في الممارسة (general-knowledge). على Windows الحديث تأكد من توقيع driver الخاص بـ com0com.
- أنشئ مجلد fixtures لكل جهاز/إصدار firmware يحتوي رسائل حقيقية (بعد إخفاء بيانات المرضى) واستخدمها في اختبارات الوحدة والتكامل.
- حالات اختبار إلزامية: frame مقسوم ETB، checksum خاطئ (NAK)، ACK مفقود (إعادة إرسال)، تكرار، sample مجهول، كود اختبار مجهول، رقم بصيغة `1,5`/`<0.5`/`>1000`، انقطاع منتصف الجلسة، رسائل عربية/بايتات عالية.

### 4.7 قائمة التحقق قبل التشغيل الفعلي (go-live)
1. وثيقة LIS spec للجهاز + رقم النسخة/firmware محفوظان.
2. الرسائل الخام لعينات حقيقية (≥ 20 عينة متنوعة، تشمل قيم حرجة وخارج المدى وQC) تعمل على بيئة اختبار.
3. جدول التحويل (mapping) لكل اختبار موقّع من مدير المعمل: الكود، الوحدة، معامل التحويل، عدد الخانات العشرية، flags.
4. اختبار الوحدات: تحويل `mg/dL` ⇄ `mmol/L` وغيره؛ مقارنة قيمة الجهاز المطبوعة بالقيمة المعروضة في النظام.
5. **فترة تشغيل موازٍ (parallel run):** مثلاً 2-4 أسابيع (المدة يقررها المدير) يُدخل فيها الموظف النتائج يدوياً مع الاستيراد الآلي، وتُقارن 100% — لا نشر آلي قبل المطابقة.
6. تدريب الموظفين على قائمة quarantine وإجراءات الانقطاع (downtime).
7. نسخ احتياطي واستعادة مجربان لقاعدة البيانات والرسائل الخام.
8. خطة رجوع (rollback) وإدخال يدوي.
9. مراجع: CLSI AUTO03 (Communications with Automated Clinical Laboratory Systems, Instruments, Devices, and Information Systems، AUTO03-A2 2009، معترف به من FDA) https://clsi.org/shop/standards/auto03/ ؛ CLSI AUTO16 (LAW-based IVD instrument interface، 2019، متاح للقراءة المجانية) https://clsi.org/shop/standards/auto16 ؛ CLSI AUTO11 (IT security of IVD، الإصدار 3 سبتمبر 2024). لم نقرأ النصوص الكاملة؛ **راجعها قبل اعتمادها كمعيار قبول**. المعايير ذات الصلة بـ LIS الخاصة بالتحقق الموسع (validation) و ISO 15189 **لم نتحقق** منها هنا.

---

## 5. ملاحظات امتثال (مصر)

- **قانون حماية البيانات الشخصية رقم 151 لسنة 2020:** يسري على البيانات المعالجة إلكترونياً؛ البيانات الصحية (الجسدية والنفسية) تُصنَّف حساسة بحسب ملخصات مكاتب محاماة؛ يشترط ترخيصاً لمن يحتفظ/يعالج البيانات إلكترونياً حسب التعريفات؛ غرامات تذكر في ملخص ثانوي بين 100 ألف و5 ملايين جنيه؛ إخطار الخروقات خلال 72 ساعة ورد في ملخص ثانوي. **حالة مركز حماية البيانات واللائحة التنفيذية متضاربة بين المصادر (غير مكتملة التفعيل حسب مصدر 2025).** المصادر: https://eg.andersen.com/wp-content/uploads/2025/06/Law-No.-151-OF-2020.pdf ، https://www.ela.law/firms/ibrachy-dermarkar/articles/personal-data-protection-law-no-151-for-year-2020-arab-republic-of-egypt ، https://regulations.clym.io/law-no-151-of-2020-egypt . هذه ترجمات/ملخصات غير رسمية ⇒ **راجع النص العربي الرسمي والجهة المختصة**.
- **مدة الاحتفاظ بنتائج المرضى والسجلات الطبية:** راجع الجهة المختصة (وزارة الصحة / نقابة / مجلس إدارة المعمل). لم نجد مصدراً موثقاً.
- **نقل البيانات خارج مصر / استخدام السحابة:** راجع الجهة المختصة.
- **متطلبات معايرة الأجهزة وسجلات QC/المعايرة (calibration):** راجع الجهة المختصة؛ المرجع المعتاد ISO 15189 ولم نتحقق من النص أو من اعتماده الإلزامي في مصر.
- **تسجيل الأجهزة (EDA):** القسم 1.3.
- ينصح تقنياً (بغض النظر عن القانون): تشفير القرص، صلاحيات حسب الدور، سجل تدقيق للتعديلات والتصحيحات، ونسخ احتياطي مشفر.

---

## 6. ما لم يُتحقق منه (ملخص)
- نص ASTM E1381/E1394 (القيم من وثائق موردين)؛ نص HL7 MLLP الرسمي.
- وكلاء Roche/Abbott/Beckman/Biosystems/Human/Snibe/Diasorin في مصر؛ أي ترتيب لحصص السوق.
- مشاكل FTDI المقلدة؛ جودة CH340/CP210x؛ صفحات socat/com0com.
- مدة الاحتفاظ القانونية للسجلات وتفاصيل التراخيص تحت قانون 151/2020.
