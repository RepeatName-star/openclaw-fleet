# Sidecar

The sidecar is a Node/TypeScript process that polls the control plane for tasks and executes them against a local provider (OpenClaw Gateway or a generic HTTP agent).

## Quick Start

```bash
pnpm install
CONTROL_PLANE_URL=http://localhost:3000 \
ENROLLMENT_TOKEN=change-me \
pnpm sidecar:dev
```

## Configuration File

Default path: `~/.openclaw-fleet/sidecar.json`

Example:
```json
{
  "controlPlaneUrl": "http://localhost:3000",
  "enrollmentToken": "change-me",
  "provider": "openclaw",
  "pollIntervalMs": 5000,
  "concurrency": 2,
  "statePath": "/home/user/.openclaw-fleet/sidecar-state.json",
  "openclawGatewayUrl": "http://127.0.0.1:18793",
  "openclawGatewayToken": "<optional>"
}
```

## Environment Overrides

- `SIDECAR_CONFIG` (override config file path)
- `CONTROL_PLANE_URL`
- `ENROLLMENT_TOKEN`
- `DEVICE_TOKEN`
- `PROVIDER` (`openclaw` or `generic`)
- `POLL_INTERVAL_MS`
- `CONCURRENCY`
- `STATE_PATH`
- `OPENCLAW_GATEWAY_URL`
- `OPENCLAW_GATEWAY_TOKEN`
- `GENERIC_PROVIDER_URL`

## Provider Modes

### OpenClaw
- Uses Gateway API at `OPENCLAW_GATEWAY_URL`.
- If `OPENCLAW_GATEWAY_TOKEN` is not set, it will try to read `~/.openclaw/openclaw.json` for a token (best-effort).

### Generic HTTP
- Requires `GENERIC_PROVIDER_URL`.
- Expects minimal endpoints: `/config/patch`, `/skills/install`, `/skills`, `/memory`, `/sessions/reset`, `/agent/run`.

