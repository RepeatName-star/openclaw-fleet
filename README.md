# OpenClaw Fleet Control Plane

[中文说明](README.zh-CN.md)

Control plane + sidecar architecture for managing multiple OpenClaw instances without modifying OpenClaw core. Works across heterogeneous hosts and networks (public IP or behind NAT) via outbound-only connections.

## Architecture

```mermaid
flowchart TB
  %% --- 样式定义 ---
  classDef component fill:#ede7f6,stroke:#5e35b1,stroke-width:1px;
  classDef db fill:#e3f2fd,stroke:#1565c0,stroke-width:1px;
  classDef plain fill:none,stroke:none;
  classDef cluster fill:#fff,stroke:#333,stroke-width:1px;

  %% ==========================================
  %% 1. 上层：控制面 (Control Plane)
  %% ==========================================
  subgraph ControlPlane["控制面 (Control Plane)"]
    direction TB
    UI[Web UI]:::component -->|REST| API[控制面 API]:::component
    
    %% 数据库层：强制放在 API 下方，内部左右排列
    subgraph DataLayer["持久化存储"]
      direction LR
      PG[(Postgres)]:::db
      R[(Redis)]:::db
    end
    
    API --> PG
    API --> R
  end

  %% ==========================================
  %% 关键布局修复：隐形“脊柱”
  %% 这行代码强制 控制面 在 主机池 的正上方
  %% ==========================================
  DataLayer ~~~ NodePool

  %% ==========================================
  %% 2. 下层：纳管主机池
  %% ==========================================
  subgraph NodePool["纳管主机池 (边缘网络 / 内网环境 / NAT)"]
    direction LR %% 强制内部元素横向排列
    
    %% --- 2.1 左侧：节点 A ---
    subgraph NodeEnvA["节点环境 A (Linux/Windows)"]
      direction TB
      SCA[Sidecar]:::component
      
      subgraph AppA["OpenClaw 核心应用"]
        direction TB
        GWA[OpenClaw Gateway]:::component --> OCA[OpenClaw Core]:::component
      end
      
      SCA -->|Local WS| GWA
    end

    %% --- 2.2 中间：省略号 ---
    Dots["..."]:::plain

    %% --- 2.3 右侧：节点 B ---
    subgraph NodeEnvB["节点环境 B (Linux/Windows)"]
      direction TB
      SCB[Sidecar]:::component
      
      subgraph AppB["OpenClaw 核心应用"]
        direction TB
        GWB[OpenClaw Gateway]:::component --> OCB[OpenClaw Core]:::component
      end
      
      SCB -->|Local WS| GWB
    end

    %% --- 强制横向顺序：A -> 省略号 -> B ---
    NodeEnvA ~~~ Dots ~~~ NodeEnvB
  end

  %% ==========================================
  %% 3. 跨网逻辑连线 (Outbound)
  %% ==========================================
  %% 这里的连线会自动寻找最短路径，因为有上面的骨架支撑，
  %% 它们现在会漂亮地汇聚到上方的 API
  SCA -->|"Outbound 长连接 (注册/保活)"| API
  SCB -->|"Outbound 长连接 (注册/保活)"| API
```

### Components

- **Control Plane (API + UI)**: Fastify service that stores state, dispatches tasks, and serves the web UI.
- **Sidecar (per instance)**: Polls tasks and executes them by calling the local OpenClaw Gateway API.
- **OpenClaw Gateway (local)**: Sidecar connects to `ws://127.0.0.1:18789` and uses standard gateway methods.
- **OpenClaw Core**: Runs on the instance host and exposes the Gateway interface.
- **Storage**: Postgres for durable state, Redis for heartbeats and leases.

### Task lifecycle

1. Task created via API/UI (`/v1/tasks`) with `pending` status.
2. Sidecar polls `/v1/tasks/pull`, lease is recorded in Redis, task becomes `leased`.
3. Sidecar executes the action via the Gateway and sends `/v1/tasks/ack`.
4. Control plane writes `task_attempts` and moves status to `done` or `failed`.

## Supported Features (Current)

- Enrollment + device token auth
- Heartbeats + online status
- Outbound-only control plane connectivity (works behind NAT / no inbound ports required on hosts)
- Task dispatch + retries + attempt history
- Actions:
  - `agent.run`
  - `session.reset`
  - `memory.replace`
  - `skills.update`
  - `skills.install`
  - `skills.status` (snapshot per instance)
  - `config.patch`
- UI:
  - Instances list + online status
  - Tasks list + task detail (attempts + error)
  - Skills snapshot + enable/disable
  - Memory/Persona editor
  - Per-instance OpenClaw console link (`control_ui_url`)

## Quick Start (Single Host)

This quick start brings up **Postgres + Redis + Control Plane + UI + Sidecar** on one host.
OpenClaw itself runs alongside the sidecar (same host or same network namespace).

```bash
# 1) Start Postgres + Redis
docker compose up -d

# 2) Install deps
pnpm install

# 3) Configure environment
cp .env.example .env
# edit .env (see below)

# 4) Run migrations
cat migrations/001_init.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet
cat migrations/002_instance_task_metadata.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet

# 5) Build + start control plane (serves UI if dist/ui exists)
pnpm build
pnpm ui:build
node --env-file=.env dist/index.js

# 6) Configure and start sidecar
mkdir -p ~/.openclaw-fleet
cat > ~/.openclaw-fleet/sidecar.json <<'JSON'
{
  "controlPlaneUrl": "http://127.0.0.1:3000",
  "enrollmentToken": "change-me",
  "provider": "openclaw",
  "pollIntervalMs": 5000,
  "concurrency": 2,
  "statePath": "/home/admin/.openclaw-fleet/sidecar-state.json",
  "openclawGatewayUrl": "ws://127.0.0.1:18789",
  "openclawGatewayToken": "replace-if-required"
}
JSON

pnpm sidecar:start
```

UI is served at `http://127.0.0.1:3000/` once `pnpm ui:build` has run.
Notes:
- `openclawGatewayToken` is optional; omit it if your gateway has no auth.
- `openclawGatewayUrl` should point to the local gateway for that instance.

UI development:

```bash
pnpm ui:dev
```

## Environment

- `PORT`: server port (default 3000)
- `DATABASE_URL`: Postgres connection string
- `REDIS_URL`: Redis connection string
- `ENROLLMENT_SECRET`: shared enrollment secret (must match sidecar `enrollmentToken`)

Example `.env`:

```
PORT=3000
DATABASE_URL=postgres://openclaw:openclaw@localhost:5432/openclaw_fleet
REDIS_URL=redis://localhost:6379
ENROLLMENT_SECRET=change-me
```

## Migrations

Run all SQL files in `migrations/` against your Postgres database:

- `migrations/001_init.sql`
- `migrations/002_instance_task_metadata.sql`

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

## Roadmap

- Group/label based task dispatch
- Group and label management UI
- Audit/event stream + history filters
- Config templates and staged rollout
- RBAC / multi-tenant support
- Realtime updates (WS) instead of polling
- Fleet-wide metrics dashboard
- Signed artifacts and versioned rollouts
