# Architecture — النظام المقترح

## المبدأ
ابدأ بـ modular monolith بحدود واضحة، API versioned، PostgreSQL في الإنتاج، object storage للتقارير/المرفقات، وworker للمهام غير المتزامنة. لا تُستخدم SQLite إلا للتجارب المحلية.

## Modules
Identity/RBAC، Patient، Catalog، Orders، Specimens، Lab Results، Radiology، Billing، Insurance، Inventory، Referrals/Commissions، Home Visits، Integrations، Notifications، Reporting، Audit، Settings.

## البيانات
كيانات أساسية: Patient، Encounter، Practitioner، Order، OrderItem، Specimen، TestDefinition، ReferenceRange، Result، Review، ImagingStudy، Report، Invoice، Payment، Coverage، StockItem، Lot، Device، IntegrationMessage، User، Role، AuditEvent. استخدم IDs داخلية وpublic IDs غير قابلة للتخمين، وoptimistic locking للنتائج والفواتير.

## الحدود والتدفق
الواجهة تستدعي API لا قاعدة البيانات. Order ينشئ specimen requirements وinvoice lines؛ collection يطلق workflow؛ result approval ينشئ immutable release version؛ integration adapter يحول HL7/ASTM إلى canonical message ثم يطلب مطابقة بشرية عند الغموض.

## الأمن والتشغيل
OIDC/SSO أو password policy قوية، MFA للأدوار الحساسة، tenant/branch scoping، encryption، rate limits، audit append-only، structured logs، metrics/traces، health checks، backup مشفر واختبار restore دوري. لا تسجل PHI في logs.

## ADRs
- **ADR-001:** modular monolith لتقليل كلفة التوزيع مع قابلية فصل module لاحقًا.
- **ADR-002:** PostgreSQL للمعاملات؛ object storage للملفات؛ لا تخزين binary كبير في DB.
- **ADR-003:** النتائج والإصدارات لا تُعدّل بعد الإصدار؛ amendment version جديد.
- **ADR-004:** adapters مستقلة لـ HL7/ASTM/DICOM مع contract tests وdead-letter queue.
- **ADR-005:** RBAC مع policy checks على الفرع ونوع العملية، وdeny-by-default.

راجع [ROADMAP](ROADMAP.md) لترتيب التنفيذ و[PRD](PRD.md) للمتطلبات.