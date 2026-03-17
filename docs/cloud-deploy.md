# Cloud Deploy & Test (Single Host)

This guide assumes **control plane + sidecar + OpenClaw gateway** all run on the same cloud VM (Alibaba Cloud Light Application Server).

## 1) Prerequisites

- Docker + Docker Compose plugin
- Node.js 18+ and pnpm
- OpenClaw gateway already running on the same host

## 2) Start Postgres + Redis

```bash
docker compose up -d
```

## 3) Configure Control Plane

Create `.env` in repo root:

```bash
PORT=3000
DATABASE_URL=postgres://openclaw:openclaw@localhost:5432/openclaw_fleet
REDIS_URL=redis://localhost:6379
ENROLLMENT_SECRET=change-me
```

Run DB migration (one-time):

```bash
psql "$DATABASE_URL" -f migrations/001_init.sql
psql "$DATABASE_URL" -f migrations/002_instance_task_metadata.sql
psql "$DATABASE_URL" -f migrations/003_bulk_management_v0_1.sql
psql "$DATABASE_URL" -f migrations/004_probe_states.sql
```

Start control plane:

```bash
pnpm install
pnpm build
pnpm ui:build   # optional but recommended if you use the built-in UI
node --env-file=.env dist/index.js
```

> Production note: after pulling backend changes, rebuild with `pnpm build`; after pulling UI changes, also run `pnpm ui:build`.

## 4) Configure Sidecar

Create `~/.openclaw-fleet/sidecar.json` on the **same host**:

```json
{
  "controlPlaneUrl": "http://127.0.0.1:3000",
  "enrollmentToken": "change-me",
  "provider": "openclaw",
  "pollIntervalMs": 5000,
  "concurrency": 2,
  "statePath": "/root/.openclaw-fleet/sidecar-state.json",
  "openclawGatewayUrl": "ws://127.0.0.1:18789"
}
```

Notes:
- `enrollmentToken` must match `ENROLLMENT_SECRET` in `.env`.
- `openclawGatewayUrl` **must be WebSocket** (default gateway port is `18789`).
- Sidecar will auto-read gateway token from `~/.openclaw/openclaw.json` if present.

Start sidecar:

```bash
pnpm sidecar:start
```

## 5) Test End-to-End

Use the test script to validate control plane + sidecar + gateway wiring:

```bash
bash scripts/cloud-test.sh
```

The script writes logs to `artifacts/` and **does not** print secrets in the log file. It will:
- Check `/health`
- Enroll once (stores device token in `artifacts/device-token.txt`)
- Create a `session.reset` task targeting that instance
- Poll DB for task status

If sidecar is running with the **same device token**, the task should end in `done`.

## 6) Troubleshooting

- Sidecar can’t connect to gateway: ensure OpenClaw gateway is running on the same host and `openclawGatewayUrl` is `ws://127.0.0.1:18789`.
- Task never completes: confirm sidecar is running and using the device token from the test script.
- Gateway auth errors: ensure `~/.openclaw/openclaw.json` exists and contains `gateway.auth.token`.
