# A.Y Scan

حزمة تشغيل محلية لمشروع A.Y Scan: واجهة React/Vite، خادم Node/TypeScript، وPostgreSQL عبر Docker Compose. هذه الحزمة لا تنشئ secrets ولا تحتوي على real patient data.

## المتطلبات

- Windows PowerShell.
- Node.js `>=20`.
- Docker CLI مع Docker daemon يعمل (Docker Desktop مناسب للتطوير المحلي).
- `pnpm` عبر Corepack أو تثبيت `pnpm` متاح في `PATH`. لا تعتمد scripts على مسار جهاز محدد.

## التثبيت المحلي

من جذر المشروع:

```powershell
pwsh -ExecutionPolicy Bypass -File .\installer\install.ps1
```

ينشئ installer ملف `.env` من `.env.example` فقط إذا لم يكن موجودًا، ولا يستبدل ملفًا موجودًا. إذا كانت `AUTH_REQUIRED=true`، يجب ضبط `AUTH_ADMIN_PASSWORD` و`AUTH_TOKEN_SECRET` يدويًا في `.env`؛ لا ينشئ installer قيمًا سرية.

يشغّل installer مشروع Docker باسم `ay-scan-local-v2`، ينتظر health لـ PostgreSQL، يطبق migrations `001` إلى `009` بالـ scripts الموجودة، ثم يبني الواجهة والخادم. لا ينفذ `down -v` ولا يحذف Docker volumes.

## التشغيل والإيقاف

شغّل الخادم في foreground كي تظهر logs في نفس النافذة:

```powershell
pwsh -ExecutionPolicy Bypass -File .\installer\start.ps1
```

لواجهة التطوير افتح نافذة PowerShell أخرى وشغّل:

```powershell
pnpm dev
```

ولواجهة build:

```powershell
pnpm preview
```

أوقف PostgreSQL دون حذف volume:

```powershell
pwsh -ExecutionPolicy Bypass -File .\installer\stop.ps1
```

## الإعدادات والروابط

المفاتيح الأساسية في `.env.example` هي `PORT` و`DATABASE_URL` و`CORS_ORIGIN` و`AUTH_REQUIRED` و`AUTH_ADMIN_EMAIL` و`AUTH_ADMIN_PASSWORD` و`AUTH_ADMIN_ROLE` و`AUTH_ADMIN_DISPLAY_NAME` و`AUTH_TOKEN_SECRET`. يعرّف `docker-compose.yml` أيضًا `POSTGRES_DB` و`POSTGRES_USER` و`POSTGRES_PASSWORD` و`POSTGRES_PORT` بقيم development defaults.

- Frontend development: `http://localhost:5173`
- Frontend preview: `http://localhost:4173`
- API: `http://localhost:3001` (أو قيمة `PORT`)
- API health: `http://localhost:3001/api/health`
- API readiness: `http://localhost:3001/api/ready`
- PostgreSQL host port الافتراضي: `55433`

قيمة `.env.example` الحالية لـ `DATABASE_URL` تستخدم `localhost:5432`. عند استخدام Docker Compose الافتراضي، scripts التشغيل تستخدم host port `55433` لهذه القيمة الافتراضية دون تعديل `.env`. إذا غيّرت `POSTGRES_PORT` أو `DATABASE_URL`، راجع تطابقهما.

## Migrations

تُطبّق بالترتيب عبر:

```powershell
pnpm db:migrate
pnpm db:migrate:lab
pnpm db:migrate:auth
pnpm db:migrate:billing
pnpm db:migrate:radiology
pnpm db:migrate:inventory
pnpm db:migrate:insurance
pnpm db:migrate:home-visits
pnpm db:migrate:devices
```

تبقى migrations `001` إلى `008` كما هي، وتضيف `db/migrations/009_devices.sql` جدول سجل الأجهزة. الأمر `pnpm db:migrate:devices` يطبّق هذه migration صراحةً. هذه migrations schema فقط؛ لا تضيف patient records أو credentials أو fixtures حقيقية. لا تُطبّق تلقائيًا عند تشغيل الخادم.

## سجل الأجهزة والتقارير

- شاشة الأجهزة تسجّل الأجهزة وتعرضها عبر `/api/devices`، وتوفر فحصًا عبر `/api/devices/:id/check-connection`. البروتوكولات المدعومة هي HL7 وASTM وTCP/IP وSerial (`hl7` و`astm` و`tcp_ip` و`serial`). حقل endpoint يقبل host/port أو إعدادات Serial ولا يحتوي credentials؛ كما تُرفض endpoints التي تتضمن username أو password.
- `check-connection` لا ينفّذ network أو serial access فعليًا، ويعيد `adapterConfigured:false`. actual driver integration يتطلب manufacturer/model وprotocol وhost/port أو serial settings وmessage samples وauth وresult mapping.
- شاشة Reports تعرض مؤشرات تشغيلية aggregate-only بلا PII، وتستخدم endpoint `/api/reports/operations` مع date filter اختياري عبر `from` و`to`.

## الفحوصات

```powershell
pnpm build
pnpm server:build
pnpm test
pnpm lint
```

آخر تحقق مسجل لهذه الأوامر كان ناجحًا؛ نتيجة الاختبارات `77` passed و`0` failed. تم تشغيل browser automation محليًا للتحقق من مسار الواجهة، ولا يشمل ذلك physical device integration. لا يوجد installer EXE ولا device drivers ضمن المستودع.

للتفاصيل التأسيسية الخاصة بالوثائق، راجع [`docs/README.md`](docs/README.md).
