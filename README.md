# OpenClaw Fleet Control Plane (MVP)

Minimal control plane API to manage OpenClaw sidecars: enrollment, heartbeats, task dispatch, and task acknowledgements.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm dev
```

## Environment

- `PORT`: server port (default 3000)
- `DATABASE_URL`: Postgres connection string
- `REDIS_URL`: Redis connection string
- `ENROLLMENT_SECRET`: shared enrollment secret

## Migrations

Run all SQL files in `migrations/` against your Postgres database. The MVP includes `migrations/001_init.sql`.

## API

See `docs/api.md` for endpoints and payloads.
