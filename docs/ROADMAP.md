# Roadmap — خطة البناء

## 0. Discovery وقرارات المجال
**Deliverables:** مقابلات، process maps، قاموس بيانات، خريطة الصلاحيات، قرار الدولة/اللوائح والأجهزة. **Size: M.** لا يبدأ التنفيذ قبل تثبيت owner وsample workflows.

## 1. Foundation
Repository، environments، CI، migrations، auth/RBAC، audit، design system RTL، observability، backup/restore. **Size: L.**

## 2. أول Vertical Slice
Patient → Catalog → Order → Invoice/Payment → printable receipt. **Size: L.** يثبت اللغة والصلاحيات والتسعير.

## 3. Laboratory Operations
Barcode، collection، rejection، work queues، result entry، review/release، report PDF. **Size: L.**

## 4. Radiology وBusiness
Appointments، radiology report، insurance، commissions، inventory، expenses، dashboards. **Size: L.**

## 5. Integrations وPilot
HL7/ASTM adapters، import/export، messaging provider، data migration، UAT، training، pilot فرع واحد. **Size: L.**

## Quality gates
DoR: workflow موثق، acceptance criteria، data/privacy owner، design reviewed. DoD: code review، automated tests، migration rollback، accessibility، audit/security checks، docs وتدريب.

## QA/UAT
Unit + contract + integration + E2E للحالات الحرجة، permission matrix tests، performance baseline، backup restore، exploratory testing، UAT scripts من الاستقبال والفني والمراجع والمحاسب.

## Go/No-Go
لا إطلاق دون: عدم وجود نتائج/فواتير غير قابلة للتتبع، restore مثبت، صلاحيات سلبية مجتازة، طباعة عربية صحيحة، reconciliation يومي، runbook، دعم fallback يدوي، وموافقة تشغيلية/قانونية.

## rollout
Pilot ببيانات مموهة ثم بيانات حقيقية بعد sign-off؛ parallel run محدود؛ daily incident review؛ rollback decision owner؛ rollout تدريجي للفروع. التفاصيل والأسئلة في [REVIEW_CHECKLIST](REVIEW_CHECKLIST.md).