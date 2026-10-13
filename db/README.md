# Database

PostgreSQL 16 (Docker, `docker-compose.yml`). The container listens on `127.0.0.1` only and `POSTGRES_PASSWORD` has no default — the installer generates it into `.env`.

## Migrations

Files in `db/migrations/NNN_snake_case.sql`, applied in order by one runner:

```sh
pnpm db:migrate        # development (tsx)
pnpm db:migrate:prod   # after pnpm server:build
```

- Applied versions are recorded in `schema_migrations` (version, name, SHA-256 checksum, time).
- Each file runs in its own transaction; a failure rolls that file back and stops.
- An advisory lock prevents two runners from interleaving.
- A file that was already applied must not be edited (its checksum is verified) — add a new migration instead.
- The server runs pending migrations on start unless `MIGRATE_ON_START=false`.
- Databases created by the old per-file scripts are adopted automatically: every historical migration is idempotent, so the first run just records them.

| Version | Content |
|---|---|
| 001 | patients, catalog, orders, audit events |
| 002 | specimens, lab results |
| 003 | users, auth sessions |
| 004 | invoices, payments |
| 005 | radiology studies |
| 006 | inventory |
| 007 | insurance policies and claims |
| 008 | home visits |
| 009 | laboratory devices |
| 010 | per-user accounts: forced password change, last login, case-insensitive email |
| 011 | trigram patient search, recency indexes, inactive seed catalog (20 common tests) |

## Accounts and sessions

Users live in `users` (scrypt password hash with a per-user salt). A session token is 256 random bits sent to the browser; only its SHA-256 hash is stored in `auth_sessions`, so a database leak does not reveal usable tokens. Logout, password changes, deactivation and role changes revoke sessions server-side.

## Backup / restore

See `installer/backup.ps1` and `installer/restore.ps1` (pg_dump custom format, single-transaction restore).
