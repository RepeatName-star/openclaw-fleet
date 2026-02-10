# OpenClaw Fleet 控制面

控制面 + Sidecar 架构，用于在不修改 OpenClaw 内核的前提下管理多实例。

## 架构

```mermaid
flowchart TB
  subgraph ControlPlane["控制面（API + UI）"]
    UI[Web UI] -->|REST| API[控制面 API]
    API --> PG[(Postgres)]
    API --> R[(Redis)]
  end

  subgraph OpenClawHost["OpenClaw 主机（每实例）"]
    SC[Sidecar]
    GW[OpenClaw Gateway]
    OC[OpenClaw Core]
    SC -->|Gateway WS| GW --> OC
  end

  SC -->|轮询任务 / 回执结果| API
```

### 组件说明

- **控制面（API + UI）**：Fastify 服务，负责状态存储、任务下发与 Web UI。
- **Sidecar（每实例）**：拉取任务并调用本机 OpenClaw Gateway 执行。
- **OpenClaw Gateway（本地）**：Sidecar 连接 `ws://127.0.0.1:18789`。
- **OpenClaw Core**：运行在实例主机上，并提供 Gateway 接口。
- **存储**：Postgres（持久化状态）+ Redis（心跳/租约）。

### 任务生命周期

1. API/UI 创建任务（`/v1/tasks`），状态为 `pending`。
2. Sidecar 拉取任务（`/v1/tasks/pull`），Redis 记录租约，任务变为 `leased`。
3. Sidecar 执行网关动作并提交回执（`/v1/tasks/ack`）。
4. 控制面写入 `task_attempts`，状态变为 `done` 或 `failed`。

## 已支持功能（当前）

- 注册与设备令牌认证
- 心跳上报 + 在线状态
- 任务下发 + 重试 + attempt 记录
- 支持的动作：
  - `agent.run`
  - `session.reset`
  - `memory.replace`
  - `skills.update`
  - `skills.install`
  - `skills.status`（实例技能快照）
  - `config.patch`
- UI：
  - 实例列表与在线状态
  - 任务列表与详情（attempt/error）
  - 技能快照与启停
  - Memory/Persona 编辑器
  - 实例 OpenClaw 控制台链接（`control_ui_url`）

## 快速开始（单机）

该流程在单机上启动 Postgres + Redis + 控制面 + UI + Sidecar。
OpenClaw 本体与 Sidecar 同机或同网络部署。

```bash
# 1) 启动 Postgres + Redis
docker compose up -d

# 2) 安装依赖
pnpm install

# 3) 配置环境变量
cp .env.example .env

# 4) 运行迁移
cat migrations/001_init.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet
cat migrations/002_instance_task_metadata.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet

# 5) 构建并启动控制面（dist/ui 存在时可直接提供 UI）
pnpm build
pnpm ui:build
node --env-file=.env dist/index.js

# 6) 配置并启动 Sidecar
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

执行过 `pnpm ui:build` 后，UI 地址为 `http://127.0.0.1:3000/`。
说明：
- `openclawGatewayToken` 可选，没有鉴权可省略。
- `openclawGatewayUrl` 指向该实例所在主机的本地 Gateway。

UI 开发：

```bash
pnpm ui:dev
```

## 环境变量

- `PORT`: 监听端口（默认 3000）
- `DATABASE_URL`: Postgres 连接串
- `REDIS_URL`: Redis 连接串
- `ENROLLMENT_SECRET`: 注册用共享密钥

示例 `.env`：

```
PORT=3000
DATABASE_URL=postgres://openclaw:openclaw@localhost:5432/openclaw_fleet
REDIS_URL=redis://localhost:6379
ENROLLMENT_SECRET=change-me
```

## 迁移

依次执行：

- `migrations/001_init.sql`
- `migrations/002_instance_task_metadata.sql`

## API

详细接口见 `docs/api.md`。

UI 相关只读接口：
- `GET /v1/instances`
- `GET /v1/instances/:id`
- `PATCH /v1/instances/:id`
- `GET /v1/instances/:id/skills`
- `GET /v1/tasks`
- `GET /v1/tasks/:id`
- `GET /v1/tasks/:id/attempts`

## Sidecar

参考 `docs/sidecar.md`。

## 云端部署

参考 `docs/cloud-deploy.md`。

## Roadmap

- 分组/标签下发
- 分组与标签管理 UI
- 审计/事件流与历史筛选
- 配置模板与分批发布
- 权限/RBAC 与多租户
- 从轮询升级为实时 WS 推送
- 全局指标与监控面板
- 版本化发布与制品签名
