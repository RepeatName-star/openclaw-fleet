# Sidecar

The sidecar connects your OpenClaw instance to the fleet control plane for enrollment, heartbeats, and task execution.

## Install

```bash
pnpm install
pnpm build
```

## Configure

Create `~/.openclaw-fleet/sidecar.json`:

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

Optional:
- `openclawGatewayToken` (token auth for gateway; default auto-read from `~/.openclaw/openclaw.json`)
- `deviceToken` (reuse a device token instead of enrolling)

## Run

```bash
pnpm sidecar:start
```

## OpenClaw Gateway Auth

Sidecar will look for a gateway token in `~/.openclaw/openclaw.json` at:

```json
{
  "gateway": {
    "auth": {
      "token": "..."
    }
  }
}
```

If you set `openclawGatewayToken` in the sidecar config, that value wins.

## Troubleshooting

- `device identity required`: ensure OpenClaw gateway expects device auth and the sidecar has a device identity (created automatically at `~/.openclaw-fleet/identity/device.json`).
- `unauthorized: gateway token missing`: ensure `openclawGatewayToken` is set or `~/.openclaw/openclaw.json` exists with `gateway.auth.token`.
- Tasks stuck in `leased`: check sidecar logs and gateway connectivity, then inspect `task_attempts` and `tasks` tables.

## Logging

Sidecar logs to stdout/stderr and `~/.openclaw-fleet/sidecar.log` by default. Override with:

```bash
OPENCLAW_SIDECAR_LOG_PATH=/path/to/sidecar.log pnpm sidecar:start
```
