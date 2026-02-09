# OpenClaw Fleet Control Plane (MVP)

Minimal control plane API to manage OpenClaw sidecars: enrollment, heartbeats, task dispatch, and task acknowledgements.

## Quick Start

```bash
pnpm install
cp .env.example .env
pnpm build
pnpm start
```

## UI

The control plane serves the UI from `dist/ui` if it exists.

```bash
pnpm ui:build
pnpm start
```

For UI development:

```bash
pnpm ui:dev
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
UI-related read endpoints:
- `GET /v1/instances`
- `GET /v1/instances/:id`
- `PATCH /v1/instances/:id`
- `GET /v1/instances/:id/skills`
- `GET /v1/tasks`
- `GET /v1/tasks/:id`
- `GET /v1/tasks/:id/attempts`

## Sidecar

See `docs/sidecar.md` for sidecar configuration and usage.

## Cloud Deploy

See `docs/cloud-deploy.md` for a single-host cloud deployment and test flow.
