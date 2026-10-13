# Traceability Matrix

| الهدف | المتطلبات | Modules | قبول/اختبار |
|---|---|---|---|
| تقليل أخطاء الهوية | FR-01 | Patient, Identity | duplicate warning، permission test |
| تتبع العينة | FR-02 | Orders, Specimens | E2E barcode/رفض/chain |
| نتيجة موثوقة | FR-03/04/07 | Results, Reporting, Audit | range/flag/review/amendment |
| تسوية مالية | FR-05/06 | Billing, Insurance | invoice/payment/refund/reconciliation |
| تقليل نفاد المخزون | FR-08 | Inventory | lot/expiry/negative stock |
| تكامل آمن | FR-09/10 | Integrations, Audit | HL7/ASTM contract + dead letter |

## فجوات تحتاج قرارًا
الدولة واللوائح، retention وconsent، أحجام التشغيل، قائمة الأجهزة والبروتوكولات، قواعد reference ranges، مزود الرسائل، PACS/DICOM، multi-branch، payment methods، SLA/RPO/RTO، وخطة migration من النظام الحالي.

كل صف يجب أن يُربط لاحقًا بـ ticket وtest case وowner قبل Sprint التنفيذ.