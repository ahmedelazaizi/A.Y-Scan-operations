# Database foundation

The local database is PostgreSQL 16.4 and is for development only. The compose file uses placeholders/default development credentials; do not use them outside local development.

## Start PostgreSQL

Copy `.env.example` to `.env` and adjust only local values if needed, then run:

```sh
pnpm db:up
```

The service is named `ay-scan-postgres` and persists data in the Docker volume `ay-scan-postgres-data-v2`.

## Apply the migration manually

Set `DATABASE_URL` in the environment, ensure the database is healthy, and run:

```sh
pnpm db:migrate
```

Migrations are intentionally not applied automatically when the server starts. `db:migrate` applies `db/migrations/001_initial.sql` through the `pg` client and fails if `DATABASE_URL` is absent or PostgreSQL is unavailable. The feature runners apply their individual schema files: `db:migrate:lab` (`002`), `db:migrate:auth` (`003`), `db:migrate:billing` (`004`), `db:migrate:radiology` (`005`), and `db:migrate:inventory` (`006`). Inventory `receipt` and `issue` quantities are positive; `adjustment` also requires `adjustmentDirection` set to `increase` or `decrease`.

The auth migration is a future DB-backed user/session foundation: the current login flow uses the environment bootstrap credentials (`AUTH_ADMIN_EMAIL`, `AUTH_ADMIN_PASSWORD`, and `AUTH_TOKEN_SECRET`) and does not insert a user or session row. Access tokens are stateless HMAC tokens, so `POST /api/auth/logout` returns `204` without revoking a token; restart or rotate `AUTH_TOKEN_SECRET` to invalidate issued tokens.

Stop the local service with:

```sh
pnpm db:down
```

The migration contains schema only. It has no patient records, catalog fixtures, credentials, or other real data. The current HTTP development fallback remains in-memory when `DATABASE_URL` is not configured.
