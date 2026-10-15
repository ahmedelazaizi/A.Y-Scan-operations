# ربط أجهزة المعمل (CBC / تجلط / بول) بنظام LIS في مصر

> آخر تحديث للبحث: 2026-10-13. هذا الملف **نتيجة بحث مكتبي على الإنترنت فقط**، لم يُختبر على أي جهاز حقيقي.
> الملف الآلي المقابل: `docs/devices/data/hematology-coag-urine.json` (35 نموذجاً).

## مقدمة

الهدف: معرفة كيف يتحدث كل جهاز مع الـ LIS (بروتوكول، نقل، تأطير الرسائل، أكواد النتائج) لكي نكتب مُحوِّلات (adapters) صحيحة. النتيجة الصريحة للبحث:

- **وثيقة واحدة فقط قرأناها كاملة وفيها كل التفاصيل**: دليل Beckman Coulter DxH Host Transmission Manual (PN B26711AF). باقي الشركات تُوزّع مواصفات الربط (interface spec) على العملاء فقط، أو كانت الصفحات محجوبة (HTTP 403/404) أو ملفات PDF مضغوطة لم نستطع قراءتها.
- لذلك معظم الأجهزة مصنّفة **low** وفيها "غير مؤكد — اسأل المورد" مع نص السؤال المطلوب. **لا تبنِ مُحوِّلاً نهائياً قبل الحصول على spec رسمي أو capture حقيقي.**
- السوق المصري: وجدنا مصدراً واحداً فقط (إنشاء Sysmex Egypt LLC في القاهرة للبيع والخدمة المباشرة بدل الموزعين). تقييم `egyptMarket` لباقي الأجهزة هو **تقدير غير موثّق** من المعرفة العامة (لم نجد مناقصات أو قوائم أسعار مصرية في أدوات البحث المتاحة). أسماء الموزعين المحليين: **غير مؤكد — اسأل المورد**.

## وسيلة الإيضاح: الثقة و provenance

| القيمة | المعنى |
|---|---|
| confidence = high | قرأنا وثيقة الشركة المصنّعة نفسها (نص كامل) |
| confidence = medium | مصدر رسمي/شبه رسمي (spec sheet، جدول CAP Today، ملخص نتيجة بحث لوثيقة لم نفتحها) يؤكد البروتوكول والنقل جزئياً دون الأكواد |
| confidence = low | لا يوجد مصدر عن الواجهة؛ المدخلات إما فارغة (null) أو افتراض مذكور صراحة |
| provenance = manufacturer-documented | رسالة منقولة من دليل الشركة مع رابطه |
| provenance = reconstructed-from-spec | رسالة بنيناها بأنفسنا حسب شكل المعيار؛ **ليست من جهاز حقيقي** وحقولها الخاصة بالشركة غير معروفة |

لا توجد أي رسالة مُلتقطة من جهاز حقيقي في هذا الملف.

## جدول ملخص

`؟` = غير مؤكد — اسأل المورد. في عمود النقل: serial baud/data/parity/stop.

| id | الشركة / الموديل | الفئة | البروتوكول | النقل (الافتراضي) | LIS option؟ | ثنائي الاتجاه؟ | الثقة |
|---|---|---|---|---|---|---|---|
| `sysmex-kx-21n` | Sysmex KX-21N | hematology | proprietary | serial ؟ | ؟ | ؟ | low |
| `sysmex-xp-300` | Sysmex XP-300 | hematology | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | low |
| `sysmex-xs-1000i` | Sysmex XS-1000i / XS-800i | hematology | astm | serial ؟ | ؟ | ؟ | low |
| `sysmex-xn-l-350-450-550` | Sysmex XN-350 / XN-450 / XN-550 (XN-L series) | hematology | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | medium |
| `sysmex-xn-1000` | Sysmex XN-1000 / XN-2000 series | hematology | astm/hl7 | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | medium |
| `mindray-bc-2800-3000plus` | Mindray BC-2800 / BC-3000Plus (3-part) | hematology | proprietary/hl7 | serial ؟ | ؟ | ؟ | low |
| `mindray-bc-5000-5150-5380-5390` | Mindray BC-5000 / BC-5150 / BC-5380 / BC-5390 (5-part) | hematology | hl7 | tcp-client (port ؟)<br>serial ؟ | ؟ | نعم | medium |
| `mindray-bc-6800` | Mindray BC-6800 / BC-6800Plus | hematology | hl7 | tcp-client (port ؟) | ؟ | نعم | low |
| `abbott-cell-dyn-ruby` | Abbott CELL-DYN Ruby | hematology | proprietary | serial ؟ | ؟ | نعم | low |
| `abbott-cell-dyn-emerald` | Abbott CELL-DYN Emerald / Emerald 22 | hematology | proprietary | serial ؟<br>tcp-client (port ؟) | ؟ | ؟ | low |
| `beckman-dxh-600-800-900` | Beckman Coulter UniCel DxH 600 / 800 / 900 (+Slidemaker) | hematology | astm | serial 9600/8/none/1<br>tcp-client (port ؟) | ؟ | نعم | high |
| `beckman-dxh-500-520` | Beckman Coulter DxH 500 / DxH 520 | hematology | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | low |
| `beckman-act-diff` | Beckman Coulter Ac·T diff / Ac·T 5diff | hematology | proprietary | serial ؟ | ؟ | ؟ | low |
| `horiba-pentra-60-xl80` | HORIBA Pentra 60C+ / Pentra XL 80 / ES 60 | hematology | astm/hl7 | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | low |
| `horiba-micros-60` | HORIBA ABX Micros 60 / Micros ES 60 | hematology | astm | serial ؟ | ؟ | ؟ | low |
| `erba-h360` | Erba Mannheim H 360 / H 560 / ELite 580 | hematology | astm | serial ؟ | ؟ | ؟ | low |
| `diatron-abacus` | Diatron MI Abacus 3CP / Abacus 5 (and Abacus 380) | hematology | hl7/proprietary | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | medium |
| `boule-medonic-m` | Boule Medonic M-series (M32/M51) | hematology | proprietary | serial ؟ | ؟ | ؟ | low |
| `urit-5160-5200` | URIT URIT-5160 / URIT-5200 | hematology | hl7 | serial ؟<br>tcp-client (port ؟) | ؟ | ؟ | low |
| `stago-sta-compact-max` | Diagnostica Stago STA Compact Max / STA R Max / STart Max | coagulation | astm | serial 9600/8/none/1 | ؟ | ؟ | medium |
| `sysmex-ca-600` | Sysmex CA-600 series / CA-1500 | coagulation | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | low |
| `sysmex-cs-2500` | Sysmex CS-2000i / CS-2500 / CS-5100 | coagulation | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | medium |
| `erba-ecl-412` | Erba Mannheim ECL 412 / ECL 105 | coagulation | proprietary | serial ؟ | ؟ | لا | low |
| `amelung-kc4` | Tcoag / Amelung KC4 Delta / KC1 Delta | coagulation | proprietary | serial ؟ | ؟ | لا | low |
| `siemens-clinitek-advantus` | Siemens Healthineers CLINITEK Advantus | urinalysis | proprietary/astm | serial ؟<br>tcp-server (port ؟) | لا | نعم | medium |
| `siemens-clinitek-status-plus` | Siemens Healthineers CLINITEK Status+ / Status Connect | urinalysis | astm | serial ؟<br>tcp-client (port ؟) | نعم | ؟ | low |
| `siemens-clinitek-novus` | Siemens Healthineers CLINITEK Novus | urinalysis | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | low |
| `roche-urisys-1100` | Roche urisys 1100 | urinalysis | astm/proprietary | serial ؟ | ؟ | نعم | low |
| `roche-cobas-u-411` | Roche cobas u 411 | urinalysis | astm | serial ؟ | ؟ | لا | low |
| `dirui-h-series` | Dirui H-100 / H-500 / FUS-100/200 | urinalysis | proprietary | serial ؟<br>tcp-client (port ؟) | ؟ | ؟ | low |
| `urit-500b` | URIT URIT-500B / URIT-31 / URIT-50 | urinalysis | proprietary | serial ؟ | ؟ | ؟ | low |
| `erba-urolyzer-laura` | Erba Lachema / Erba Mannheim Urolyzer / LAURA Smart | urinalysis | astm | serial ؟ | ؟ | ؟ | low |
| `sysmex-uf-1000i-5000` | Sysmex UF-1000i / UF-5000 | urinalysis | astm | serial ؟<br>tcp-client (port ؟) | ؟ | نعم | low |
| `mission-u500` | ACON / Mission Mission U500 | urinalysis | proprietary | serial ؟ | ؟ | ؟ | low |
| `arkray-aution` | Arkray AUTION Elven / AUTION MAX | urinalysis | astm | serial ؟ | ؟ | ؟ | low |

## لمحة عن البروتوكولات (مشترك بين العائلات)

### ASTM E1381 (LIS1-A) + E1394 (LIS2-A2)
- المصادقة: **لا يوجد** (لا اسم مستخدم ولا كلمة سر). الحماية تكون فيزيائية (كابل مخصص) أو شبكياً (VLAN/IP allow-list على الـ LIS)، أو عبر middleware الشركة (مثل Sysmex WAM) ولكن هذا مذكور فقط كمنتج في المصادر.
- مراحل الرابط (من دليل Beckman): establishment (`<ENQ>` ثم `<ACK>`)، transfer (إطارات)، termination (`<EOT>`). الإطار: `<STX>` + رقم الإطار (0-7، يبدأ 1) + نص + `<CR>` + `<ETX>` (أو `<ETB>` للإطار الوسيط) + checksum من خانتين hex + `<CR><LF>`. الـ checksum = مجموع البايتات من رقم الإطار حتى `<ETX>` (modulo 256). أقصى حجم إطار في Beckman: 64,000 حرف.
- سجلات الرسالة: `H` header، `P` patient، `O` order، `R` result، `C` comment، `Q` query، `M` manufacturer، `L` terminator. المحددات في Beckman: field `|`، repeat `\`، component `!`، escape `~` (يختلف عن الشائع `^`، فاقرأ الـ header دائماً لتحديد المحددات).
- ثنائي الاتجاه = الجهاز يرسل `Q` (host query) والـ LIS يردّ بـ `P`/`O`.

### HL7 v2 فوق MLLP
- الإطار: `0x0B` + الرسالة (مقاطع تنتهي بـ `\r`) + `0x1C` + `0x0D`. لا مصادقة. الإصدار (2.3.1؟ 2.4؟) والمنفذ وهل الجهاز client أم server **يجب سؤال المورد** لكل موديل.
- (قاعدة MLLP هنا معيار عام؛ لم نتمكن من فتح ملف مواصفة HL7 نفسه.)

---

## 1) Beckman Coulter DxH 600 / 800 / 900 (ثقة high)

المصدر المقروء بالكامل: Host Transmission Manual PN B26711AF (Sept 2017) — https://5.imimg.com/data5/TW/SB/MY-1134460/beckman-coulter-dxh-slidemaker-stainer-ii-cellular-analysis-system.pdf

| البند | القيمة (من الدليل) |
|---|---|
| البروتوكول | ASTM: الرابط CLSI LIS1-A (ASTM 1381-02) والرسائل CLSI LIS2-A (ASTM 1394-97) |
| Serial | EIA-232-D، الجهاز DTE، موصل DB-9 Male خلف حاسوب الجهاز، COM1. الافتراضي: **9600 / 8 data / no parity / 1 stop**؛ الخيارات: baud 2400-57600، parity odd/even/off، stop 1 أو 2 |
| Pinout | pin2 = RXD، pin3 = TXD، pin5 = GND (الكابل null-modem مع الكمبيوتر) |
| TCP/IP | RJ45 عبر راوتر NETGEAR مُهيّأ مسبقاً؛ **الـ LIS هو TCP server** ويحدد IP والمنفذ؛ الـ DxH هو client. رقم المنفذ **غير مذكور** (يوصى باستخدام TCP عند كبر الرسائل مثل الـ histograms) |
| ثنائي الاتجاه | نعم: host query `Q`، تنزيل الطلبات (Test Order Download)، رسائل رفض، أخطاء مرقمة |
| المصادقة | لا شيء |
| LIS option؟ | غير مذكور في الدليل — اسأل Beckman (توجد لوحات/اختبارات "supported or enabled" ويرد خطأ إذا لم تكن مفعّلة) |
| الاستخراج | يرسل لكل عينة (Sample ID) سجل O ثم R لكل معامل؛ حقل R4 = القيمة + مكوّن flags (4 خانات، مثل `1.0!R H`)، الحقل 8 = `A` عند وجود flag أو قيمة غير رقمية؛ الحالة `F`/`C`/`S`/`R` |
| معاملات RUO | تبدأ بـ `@` ويضيف الجهاز سجل comment تحذيرياً |

جدول الأكواد (الجدول A.12 في الدليل = LOINC الرسمي من Beckman):

| instrumentCode | الاسم | LOINC | الوحدة | ملاحظات |
|---|---|---|---|---|
| `WBC` | WBC (corrected for NRBC) | 33256-9 | 10^3/uL | LOINC taken from Beckman Table A.12 |
| `UWBC` | WBC uncorrected | 6690-2 | 10^3/uL | Table A.12 |
| `RBC` | RBC | 789-8 | 10^6/uL | Table A.12 |
| `HGB` | Hemoglobin | 718-7 | g/dL | Table A.12; unit is user-selectable on the instrument |
| `HCT` | Hematocrit | 4544-3 | % | Table A.12 |
| `MCV` | MCV | 787-2 | fL | Table A.12 |
| `MCH` | MCH | 785-6 | pg | Table A.12 |
| `MCHC` | MCHC | 786-4 | g/dL | Table A.12 |
| `RDW` | RDW-CV | 788-0 | % | Table A.12 |
| `RDW-SD` | RDW-SD | 21000-5 | fL | Table A.12 |
| `PLT` | Platelets | 777-3 | 10^3/uL | Table A.12 |
| `MPV` | MPV | 32623-1 | fL | Table A.12 |
| `@PDW` | PDW (research use only) | 32207-3 |  | '@' prefix = RUO; instrument adds a comment record saying not for diagnostic use |
| `@PCT` | PCT (research use only) | ؟ | % | '@' prefix = RUO; no LOINC in Table A.12 |
| `NE` | Neutrophils % | 770-8 | % | Table A.12 |
| `LY` | Lymphocytes % | 736-9 | % | Table A.12 |
| `MO` | Monocytes % | 5905-5 | % | Table A.12 |
| `EO` | Eosinophils % | 713-8 | % | Table A.12 |
| `BA` | Basophils % | 706-2 | % | Table A.12 |
| `NE#` | Neutrophils absolute | 751-8 | 10^3/uL | Table A.12 |
| `LY#` | Lymphocytes absolute | 731-0 | 10^3/uL | Table A.12 |
| `MO#` | Monocytes absolute | 742-7 | 10^3/uL | Table A.12 |
| `EO#` | Eosinophils absolute | 711-2 | 10^3/uL | Table A.12 |
| `BA#` | Basophils absolute | 704-7 | 10^3/uL | Table A.12 |
| `NRBC` | NRBC per 100 WBC | 34200-6 | /100WBC | Table A.12 |
| `NRBC#` | NRBC absolute | 771-6 | 10^3/uL | Table A.12 |
| `RET` | Reticulocytes % | 17849-1 | % | Table A.12 (only if retic panel ordered) |
| `RET#` | Reticulocytes absolute | 14196-0 | 10^6/uL | Table A.12 |
| `MRV` | Mean reticulocyte volume | 48706-6 | fL | Table A.12 |
| `IRF` | Immature reticulocyte fraction | 33516-6 |  | Table A.12 |

رسائل نموذجية (موثّقة من الشركة): انظر JSON (`beckman-dxh-600-800-900.samples`): Patient Result Upload، و Host Query/Response. مقتطف:

```
H|\!~|||DxH|||||LIS||P|LIS2-A|20080923072941
P|1|||
O|1|89338176210|00161|!!!CDR\!!!SS!7|R|||||||||20080923072509|Whole blood|||||!DevOp|DO|20080923072928|||F
R|1|!!!WBC!33256-9|6.8!R |10^3/uL||3.6 to 10.2|A||F||||20080923072716|AM44001
R|4|!!!HGB!718-7|13.0|g/dL||12.5 to 16.3|||F||||20080923072716|AM44001
L|1|N
```

**DxH 500/520** و**Ac·T**: لا وثيقة. CAP Today يذكر LIS01-A2/LIS02-A2 لـ DxH 520/560 فقط. لا تفترض أن تفاصيل DxH 800 تنطبق.

## 2) Sysmex هيماتولوجي (KX-21N، XP-300، XS-1000i، XN-L 350/450/550، XN-1000/2000)

- **ما تأكد**: XN-L: واجهة "ASTM XN-L" (Fact sheet). CAP Today 2023: XN-350/450/550 "XN series ASTM 1381-95/1894-97 أو 1381-02/1894-97"؛ XN-1000/2000 "ASTM 1394-91, HL7" مع host query وتنزيل الطلبات. XP-300: LAN (TCP/IP) أو RS-232C ثنائي الاتجاه (ملخص نتيجة بحث لكتيب، الملف نفسه لم يفتح). XS-1000i: دليل IFU فيه قسم "HOST Connection" (لم يُقرأ). KX-21N: RS-232 فقط، البروتوكول القديم الخاص بـ Sysmex غير موثّق لدينا.
- **غير مؤكد — اسأل المورد**: baud/المنفذ/دور الجهاز، هل يلزم ترخيص LIS، صيغة test ID في سجل R، الوحدات.
- Sysmex Egypt LLC (القاهرة) تبيع وتخدم مباشرة (مصدر: https://www.sysmex.co.id/sysmex-establishes-subsidiary-in-egypt-and-begins-conducting-direct-sales-and-services/?lang=id). اطلب منهم "Host Interface Specification" لكل موديل.
- جدول أكواد **عام** (تقدير لشكل الأسماء، ليس أكواد Sysmex المؤكدة) + LOINC من معرفة LOINC العامة:

| instrumentCode | الاسم | LOINC | الوحدة | ملاحظات |
|---|---|---|---|---|
| `WBC` | WBC | 6690-2 | 10^3/uL | XN family also sends research (RUO) and flag parameters (e.g. IG, RET-He, NRBC); ASTM test-ID string layout unknown to us |
| `RBC` | RBC | 789-8 | 10^6/uL |  |
| `HGB` | Hemoglobin | 718-7 | g/dL | Some instruments send g/L or mmol/L depending on configuration |
| `HCT` | Hematocrit | 4544-3 | % | Some instruments send L/L fraction |
| `MCV` | MCV | 787-2 | fL |  |
| `MCH` | MCH | 785-6 | pg |  |
| `MCHC` | MCHC | 786-4 | g/dL | g/L on some configs |
| `PLT` | Platelets | 777-3 | 10^3/uL |  |
| `RDW-CV` | RDW-CV | 788-0 | % | May appear as RDW or RDW-CV |
| `RDW-SD` | RDW-SD | 21000-5 | fL |  |
| `MPV` | MPV | 32623-1 | fL |  |
| `PDW` | PDW | 32207-3 | fL or % | Unit differs by vendor |
| `PCT` | Plateletcrit | 51637-7 | % | Verify LOINC against your LOINC release |
| `NEUT%` | Neutrophils % | 770-8 | % | Also sent as NE%/GRAN%/GR% on 3-part analyzers (GRAN != NEUT: 3-part reports granulocytes, LOINC 19023-1 for GRAN%) |
| `LYMPH%` | Lymphocytes % | 736-9 | % | Also LYM%/LY% |
| `MONO%` | Monocytes % | 5905-5 | % | Also MO%; on 3-part analyzers this is MID%/MXD% (a mixed population, do NOT map to monocytes silently) |
| `EO%` | Eosinophils % | 713-8 | % |  |
| `BASO%` | Basophils % | 706-2 | % |  |
| `NEUT#` | Neutrophils absolute | 751-8 | 10^3/uL |  |
| `LYMPH#` | Lymphocytes absolute | 731-0 | 10^3/uL |  |
| `MONO#` | Monocytes absolute | 742-7 | 10^3/uL |  |
| `EO#` | Eosinophils absolute | 711-2 | 10^3/uL |  |
| `BASO#` | Basophils absolute | 704-7 | 10^3/uL |  |
| `IG%` | Immature granulocytes % | 71695-1 | % | XN/DxH/BC-6x00 class only; verify LOINC |
| `IG#` | Immature granulocytes absolute | 53115-2 | 10^3/uL | verify LOINC |
| `NRBC#` | NRBC absolute | 771-6 | 10^3/uL | 5-part class only |
| `NRBC%` | NRBC per 100 WBC | 34200-6 | /100WBC |  |
| `RET%` | Reticulocytes % | 17849-1 | % | Only where retic channel exists |
| `RET#` | Reticulocytes absolute | 14196-0 | 10^6/uL |  |

مثال رسالة **مُعاد بناؤها حسب الشكل العام** (ليست من Sysmex): في JSON (`sysmex-xn-1000.samples`).

## 3) Mindray (BC-2800/3000Plus، BC-5000/5150/5380/5390، BC-6800)

- **ما تأكد**: CAP Today 2023 يسرد **HL7** لـ BC-5390 (مع بث الطلبات و host query) وكذلك BC-3600؛ Mindray تقول إن لديها بروتوكول HL7 مدمج في صفحات منتجاتها. باقي الموديلات: افتراض فقط.
- **غير مؤكد — اسأل المورد**: منفذ TCP، هل الجهاز client أم server (في أجهزة Mindray الكيميائية BS-200 يضبط المستخدم IP/Port الوجهة على الجهاز وهو يتصل، مصدر منتدى MedWrench — ليس BC)، إصدار HL7، معرّفات OBX-3، وهل تُرسل histograms كـ OBX نوع ED/NA.
- BC-2800/3000Plus (3-part): لا نعرف أي بروتوكول؛ خطر: خلط MID/MXD مع MONO و GRAN مع NEUT — لا تربط تلقائياً.
- مثال HL7 مُعاد بناؤه (ليس من Mindray): في JSON (`mindray-bc-5000-5150-5380-5390.samples`).

## 4) Abbott CELL-DYN (Ruby, Emerald)

CAP Today: "proprietary" (+ "RS232, bidirectional" لجهاز آخر). Emerald: RS232 وTCP/IP؛ Ruby: RS232 حسب ملخص FDA. لا نعرف البروتوكول (ASTM أم صيغة Abbott الخاصة) ولا القيم الافتراضية. اطلب "CELL-DYN LIS Interface Specification".

## 5) HORIBA (Pentra 60C+/XL 80، Micros 60)

CAP Today: Pentra 60C+ "ASTM 1394 and 1238, HL7"؛ XL 80 "proprietary, ASTM 1394 and 1238, HL7". مقتطف Scribd لعائلة ABX Pentra ML/DX/DF: ASTM E1381/E1394 على RS-232 DB-9 (مصدر ثانوي). Micros 60: لا شيء مؤكد.

## 6) Erba, Diatron, Boule/Medonic, URIT, (Dirui/Genrui/Rayto لم يبحث عنها بشكل مفيد)

- **Diatron Abacus**: CAP Today: Abacus 3CP "HL7, Diatron Serial Communication"، Abacus 5 "HL7, Diatron Serial Protocol" (ثقة medium للبروتوكول فقط).
- **Erba H360/ELite، Boule Medonic، URIT-5160/5200**: **لا مصدر**. القيم في JSON فارغة عمداً.
- Genrui وRayto وDirui BC: لم نجد شيئاً ولم ندرجها في JSON.

## 7) أجهزة التجلط

| الجهاز | ما تأكد |
|---|---|
| Stago STA Compact Max / STA R Max / STart Max | ملخص وثيقة "Compact Max LIS protocol" rev 0932209B: RS-232C، موصل DB-9 (الجهاز male)، pin2 RX / pin3 TX / pin5 GND، لا flow control؛ **baud 9600 (النطاق 110-115200)، 8 data، parity none، 1 stop**. بروتوكول ASTM (وثيقة منفصلة 0931999B V3). **لم نفتح الـ PDF** (403) |
| Sysmex CS-2000i/2500 | ورقة Siemens: "Bidirectional RS-232C serial port or via Ethernet-TCP/IP"، ASTM1381-95/1394-95 أو 1381-02/1394-97 |
| Sysmex CA-600 / CA-1500 | ASTM؛ إعداد "Format output" = ASTM أو ASTM2 (ASTM2 تضيف traceability) |
| Erba ECL, Amelung KC4 | لا مصدر؛ غالباً طباعة/serial بسيط (افتراض) |
| STA Compact القديم / ST4 / Mindray C-series / Diagon / Coatron | لم نبحث بما يكفي |

جدول الأكواد (أسماء عامة + LOINC للمرجع؛ **أكواد Stago/Sysmex الفعلية غير مؤكدة**):

| instrumentCode | الاسم | LOINC | الوحدة | ملاحظات |
|---|---|---|---|---|
| `PT` | Prothrombin time | 5902-2 | s | Seconds |
| `PT%` | PT activity (Quick %) | ؟ | % | No single LOINC confirmed; ask lab which expression they report |
| `INR` | INR | 6301-6 |  | Derived from PT + ISI |
| `PT-R` | PT ratio | 5894-1 |  | verify LOINC |
| `APTT` | aPTT | 14979-9 | s |  |
| `FIB` | Fibrinogen (Clauss) | 3255-7 | mg/dL or g/L | Unit depends on lab config |
| `TT` | Thrombin time | 3243-3 | s |  |
| `DDI` | D-Dimer (FEU) | 48066-5 | ng/mL FEU | Units (FEU vs DDU, ng/mL vs ug/mL) vary by reagent: DDU=48065-7 |

مثال ASTM مُعاد بناؤه (ليس من Stago): في JSON (`stago-sta-compact-max.samples`) وفيه checksum صحيح.

## 8) أجهزة البول

- **Siemens CLINITEK Advantus** (ثقة medium): دليل المشغل: خيار Port = Off/Computer/Ethernet/Both؛ baud 1200/2400/4800/9600/19200؛ Data/Parity = 8/None أو 7/Even أو 7/Odd أو 7/None؛ Output format = **CCS** (stop bit واحد) أو CT200+ أو CT200 (2 stop). تنزيل loadlist من الـ LIS **يتطلب CCS**. ورقة المواصفات: "ASTM (CCS) format" وEthernet 10/100 ثنائي الاتجاه. **تخطيط CCS "متوفر من الدعم الفني"** — اطلبه. ليس لدينا baud افتراضي.
- **Status+/Connect**: وجود قاعدة Connector (Ethernet/WiFi) وإعداد إرسال تلقائي للنتائج؛ لا وثيقة بروتوكول.
- **Roche urisys 1100**: مصدر بائع: واجهة تسلسلية للحاسوب/المضيف، وبروتوكول المضيف قابل للاختيار (أحادي/ثنائي/ASTM) من الإعدادات. **cobas u 411**: يطبع ويرسل لـ LIS؛ SOP مستشفى أمريكي يصفه أحادي الاتجاه.
- **Dirui H-series، URIT-500B، Mission U500، Erba Urolyzer/Laura، Sysmex UF، Arkray**: لا وثائق بروتوكول.

جدول أكواد شرائط البول (عام، LOINC للمرجع، **الأسماء التي يرسلها كل جهاز غير مؤكدة**):

| instrumentCode | الاسم | LOINC | الوحدة | ملاحظات |
|---|---|---|---|---|
| `SG` | Specific gravity | 5811-5 |  | Strip reading |
| `PH` | pH | 5803-2 |  |  |
| `LEU` | Leukocyte esterase | 5799-2 |  | Semi-quant: neg/trace/+/++/+++ or Leu/uL |
| `NIT` | Nitrite | 5802-4 |  | neg/pos |
| `PRO` | Protein | 5804-0 | mg/dL | Semi-quant |
| `GLU` | Glucose | 5792-7 | mg/dL | Semi-quant |
| `KET` | Ketones | 5797-6 | mg/dL |  |
| `UBG` | Urobilinogen | 5818-9 | mg/dL or E.U./dL |  |
| `BIL` | Bilirubin | 5770-3 |  |  |
| `BLD` | Blood (occult) | 5794-2 |  | Ery/uL or +/++/+++ |
| `COLOR` | Color | 5778-6 |  | Text |
| `CLA` | Clarity / turbidity | 5767-9 |  | Text |
| `ASC` | Ascorbic acid | 25364-2 |  | Only on strips that have the pad; verify LOINC |
| `ALB` | Albumin (microalbumin strip) | 14957-5 | mg/L | Only on Micral/ACR strips |
| `CRE` | Creatinine (strip) | 2161-8 | mg/dL | Only on ACR strips; verify LOINC |

مثال ASTM للبول مُعاد بناؤه: في JSON (`roche-urisys-1100.samples`). قيم الشرائط عادةً نصية شبه كمية (Negative/Trace/1+..)؛ المفردات تختلف بحسب الشركة.

---

## أسئلة تسأل بها المورد/الفني لكل جهاز

أسئلة عامة لكل الأجهزة:
1. أرسل لنا **Interface/Host Communication Specification** الرسمي (PDF) لنفس الموديل ونسخة السوفتوير.
2. البروتوكول وإصداره؛ هل يلزم ترخيص/خيار LIS أو دخول service menu لتفعيل الإخراج؟
3. نقل: serial (baud/data/parity/stop + pinout الكابل) أو TCP (دور الجهاز، IP، المنفذ، هل يتطلب IP ثابت).
4. ثنائي الاتجاه؟ ما اسم الحقل الذي يحمل الـ barcode / Sample ID (O3 أو O4)؟
5. جدول test IDs والوحدات والـ flags (H/L/A/N، `*`)، وهل تُرسل histograms/RUO.
6. نموذج رسالة حقيقية (capture) من نفس الموديل.

تفصيلي (آخر ثلاثة أسئلة مسجّلة لكل جهاز في JSON):

- **Sysmex KX-21N** (`sysmex-kx-21n`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | هل مخرج KX-21N هو الـ ASTM أم الصيغة الخاصة القديمة؟ وهل يلزم كابل Sysmex أصلي (pinout)؟
- **Sysmex XP-300** (`sysmex-xp-300`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Sysmex XS-1000i / XS-800i** (`sysmex-xs-1000i`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Sysmex XN-350 / XN-450 / XN-550 (XN-L series)** (`sysmex-xn-l-350-450-550`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | XN-L ASTM interface specification (Sysmex 'Host Interface Specifications')
- **Sysmex XN-1000 / XN-2000 series** (`sysmex-xn-1000`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | هل الربط مباشر أم عبر Sysmex WAM/middleware؟
- **Mindray BC-2800 / BC-3000Plus (3-part)** (`mindray-bc-2800-3000plus`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Mindray BC-5000 / BC-5150 / BC-5380 / BC-5390 (5-part)** (`mindray-bc-5000-5150-5380-5390`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | Mindray 'HL7 Communication Protocol' PDF للموديل ونسخة السوفتوير
- **Mindray BC-6800 / BC-6800Plus** (`mindray-bc-6800`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Abbott CELL-DYN Ruby** (`abbott-cell-dyn-ruby`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | Abbott CELL-DYN LIS Interface Specification (ASTM أم Abbott proprietary؟)
- **Abbott CELL-DYN Emerald / Emerald 22** (`abbott-cell-dyn-emerald`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Beckman Coulter UniCel DxH 600 / 800 / 900 (+Slidemaker)** (`beckman-dxh-600-800-900`): هل تم تفعيل Cell Population Data/RUO parameters (علامة @)؟ | هل Query وOrder download مفعّلان؟ | إعداد وحدات HGB/MCHC (g/dL أم g/L)
- **Beckman Coulter DxH 500 / DxH 520** (`beckman-dxh-500-520`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | Host Transmission Manual الخاص بـ DxH 500 تحديداً
- **Beckman Coulter Ac·T diff / Ac·T 5diff** (`beckman-act-diff`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **HORIBA Pentra 60C+ / Pentra XL 80 / ES 60** (`horiba-pentra-60-xl80`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **HORIBA ABX Micros 60 / Micros ES 60** (`horiba-micros-60`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Erba Mannheim H 360 / H 560 / ELite 580** (`erba-h360`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Diatron MI Abacus 3CP / Abacus 5 (and Abacus 380)** (`diatron-abacus`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | Diatron Serial Protocol document
- **Boule Medonic M-series (M32/M51)** (`boule-medonic-m`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **URIT URIT-5160 / URIT-5200** (`urit-5160-5200`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Diagnostica Stago STA Compact Max / STA R Max / STart Max** (`stago-sta-compact-max`): نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | Stago 'ASTM Protocol' 0931999B V3 document | كود كل تحليل (PT/APTT/FIB/D-Dimer) كما يرسله الجهاز
- **Sysmex CA-600 series / CA-1500** (`sysmex-ca-600`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | إعداد Format output: ASTM أم ASTM2؟
- **Sysmex CS-2000i / CS-2500 / CS-5100** (`sysmex-cs-2500`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Erba Mannheim ECL 412 / ECL 105** (`erba-ecl-412`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Tcoag / Amelung KC4 Delta / KC1 Delta** (`amelung-kc4`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Siemens Healthineers CLINITEK Advantus** (`siemens-clinitek-advantus`): ملف CCS format specification الخاص بالـ Advantus | الـ baud الحالي المضبوط على الجهاز، وهل Ethernet port مفعّل وما رقم المنفذ؟ | هل الجهاز يعمل client أم server على Ethernet؟
- **Siemens Healthineers CLINITEK Status+ / Status Connect** (`siemens-clinitek-status-plus`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | هل Status+ لديه Connector base؟ وإلا فالمخرج Serial فقط؟
- **Siemens Healthineers CLINITEK Novus** (`siemens-clinitek-novus`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Roche urisys 1100** (`roche-urisys-1100`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | أي وضع Host Protocol مختار (uni/bi/ASTM)؟
- **Roche cobas u 411** (`roche-cobas-u-411`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Dirui H-100 / H-500 / FUS-100/200** (`dirui-h-series`): جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟ | Dirui communication protocol document (غالباً HL7 أو خاص)
- **URIT URIT-500B / URIT-31 / URIT-50** (`urit-500b`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Erba Lachema / Erba Mannheim Urolyzer / LAURA Smart** (`erba-urolyzer-laura`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Sysmex UF-1000i / UF-5000** (`sysmex-uf-1000i-5000`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **ACON / Mission Mission U500** (`mission-u500`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟
- **Arkray AUTION Elven / AUTION MAX** (`arkray-aution`): هل الجهاز ثنائي الاتجاه (worklist/host query) وهل يحتاج ترخيصاً؟ | جدول أكواد النتائج (test IDs) والوحدات والـ flags وملف interface specification الرسمي (PDF)؟ | نموذج رسالة حقيقية (capture) من جهاز بنفس الإصدار؟

## تحفظات

1. 27 من 35 نموذجاً **low**: لا تعتمد عليها بدون وثيقة. فقط DxH 600/800/900 high.
2. بعض الملفات قُرئت من نتائج البحث (ملخصات) وليس من نصوصها (Stago، XP-300، XS-1000i، CELL-DYN)؛ المصدر مدرج في JSON لكن القيم تحتاج تحقق.
3. جدول LOINC في الأقسام غير Beckman مأخوذ من المعرفة العامة بـ LOINC وليس من وثائق الشركات؛ تحقق منه في إصدار LOINC لديك (الأكواد المعلّمة verify). أكواد Beckman LOINC في الجدول A.12 رسمية.
4. تقدير `egyptMarket` غير موثّق.
5. اختلاف المحددات (`!` و`~` في Beckman مقابل `^` و`&` الشائعة) يكسر المحللات الثابتة؛ اقرأ دائماً سجل H.
6. لا نعرف أي جهاز يستخدم انعكاس الأدوار (جهاز client أم server) إلا Beckman (الـ LIS هو server).
7. عند الاختبار على جهاز حقيقي احتفظ بـ hex dump للالتقاط وأضفه هنا كعينة جديدة بـ provenance منفصل.
