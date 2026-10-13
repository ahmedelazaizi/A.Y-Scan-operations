# A.Y Scan — Work Plan

## المرحلة 0: تثبيت القرار
**الهدف:** اعتماد الاسم، الهوية، التقنية، الدولة، الفرع التجريبي، ومالك القرار.
**المخرجات:** Brand Guidelines، Product brief، decision log، أصحاب المصلحة.
**الحجم:** S. **Gate:** موافقة المالك على الاسم والنطاق والهوية.

## المرحلة 1: Discovery
**الهدف:** توثيق التشغيل الحقيقي لا تقليد الصور فقط.
**المخرجات:** مقابلات، process maps، حالات الطلب والعينة والنتيجة والفاتورة، قاموس بيانات، صلاحيات.
**الحجم:** M. **Dependency:** مالكو التشغيل والمختبر والأشعة والمحاسبة.

## المرحلة 2: UX وDesign System
**الهدف:** واجهة RTL سريعة وواضحة.
**المخرجات:** information architecture، user flows، tokens، مكونات، حالات loading/error/empty، prototype للشاشات الأساسية.
**الحجم:** L. **Gate:** اختبار prototype مع 5 مستخدمين على الأقل.

## المرحلة 3: Foundation
**الهدف:** أساس production-ready.
**المخرجات:** React/TypeScript، NestJS، PostgreSQL، auth/RBAC، audit، migrations، CI، environments، observability، backup.
**الحجم:** L. **Gate:** deploy تجريبي، restore ناجح، permission matrix.

## المرحلة 4: أول Vertical Slice
**الهدف:** مسار قابل للاستخدام من البداية للنهاية.
**المخرجات:** Patient → Catalog → Order → Invoice → Payment → receipt.
**الحجم:** L. **Gate:** UAT للاستقبال والمحاسبة.

## المرحلة 5: Laboratory Operations
**المخرجات:** barcode، specimen collection، rejection، queues، result entry، reference ranges، review، release، PDF.
**الحجم:** L. **Gate:** مطابقة العينة والنتيجة والتدقيق.

## المرحلة 6: Radiology وBusiness
**المخرجات:** appointments، modality، report، insurance، commissions، inventory، expenses، dashboards.
**الحجم:** L. **Gate:** UAT للأشعة والمخزون والتسوية.

## المرحلة 7: Integrations وPilot
**المخرجات:** HL7/ASTM adapters، import/export، notification provider، migration، training، runbook، pilot فرع واحد.
**الحجم:** L. **Gate:** go/no-go وrollback واضحان.

## RACI مبسط
- Product owner: A للمنتج والنطاق.
- Operations lead: A لسير التشغيل وUAT.
- Medical/lab lead: A للنتائج والمرجعيات.
- Tech lead: A للمعمارية والأمن.
- UX lead: R للهوية والتجربة.
- QA: R للاختبارات والتتبعية.
- Legal/compliance: C قبل البيانات الحقيقية والإطلاق.

## Definition of Ready
workflow موثق، acceptance criteria، owner، privacy impact، تصميم للحالات الأساسية، ومخاطر معروفة.

## Definition of Done
تنفيذ reviewed، tests آلية، permission tests، audit، accessibility، migration rollback، documentation، UAT sign-off، وقياس الأداء.

## مخاطر وقرارات مبكرة
الأجهزة والبروتوكولات، retention واللوائح المحلية، PACS/DICOM، حجم التشغيل، الرسائل، الدفع، الفروع، وRPO/RTO. لا يبدأ التكامل مع الأجهزة قبل الحصول على sample messages حقيقية منزوعة البيانات.
