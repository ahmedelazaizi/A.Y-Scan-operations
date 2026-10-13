# Review Checklist

## Product/domain
- [ ] الأدوار ومسؤوليات الاعتماد واضحة.
- [ ] حالات الطلب/العينة/النتيجة/الفاتورة وانتقالاتها معتمدة.
- [ ] سياسات الخصم والاسترداد والتأمين والعمولات موثقة.
- [ ] سيناريوهات abnormal/critical results وrejection موجودة.

## UX/accessibility
- [ ] RTL وArabic/English، keyboard، contrast، print، mobile/desktop.
- [ ] رسائل الخطأ لا تكشف بيانات زائدة، والعمليات الخطرة تحتاج تأكيدًا.
- [ ] لا يعتمد التصميم على ألوان الحالة وحدها.

## Security/privacy/compliance
- [ ] threat model، RBAC matrix، MFA، secrets، encryption.
- [ ] audit وretention وconsent وexport/delete مراجع قانونيًا محليًا.
- [ ] لا توجد بيانات حقيقية في fixtures أو الصور التجريبية.

## Architecture/operations
- [ ] حدود modules وAPI contracts وidempotency واضحة.
- [ ] backup/restore وmonitoring وincident/runbook مجربة.
- [ ] integrations لها retries وdead-letter وmanual reconciliation.
- [ ] load/performance وmigration rollback محددان.

## Delivery
- [ ] كل requirement له acceptance test وowner.
- [ ] UAT يغطي التشغيل والمختبر والأشعة والمحاسبة.
- [ ] go/no-go وrollback والتدريب والدعم محددة.
