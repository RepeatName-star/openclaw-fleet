# OpenClaw Fleet 控制面

控制面 + Sidecar 架构，用于在不修改 OpenClaw 内核的前提下管理多实例。支持跨网络与异构主机（公网或 NAT 后）通过仅出站连接纳管。

## 架构

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
- 仅出站连接控制面（可在 NAT 后运行，无需开放入站端口）
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

完整路线图与里程碑见 `docs/roadmap.md`。
批量管理核心语义（Selector/Campaign/Policy）见 `docs/bulk-management.md`。
v0.1 功能清单与边界见 `docs/v0.1-scope.md`。
v0.1 实现计划见 `docs/plans/2026-03-11-bulk-management-v0.1.md`。

- 分组/标签下发
- 分组与标签管理 UI
- 审计/事件流与历史筛选
- 配置模板与分批发布
- 权限/RBAC 与多租户
- 从轮询升级为实时 WS 推送
- 全局指标与监控面板
- 版本化发布与制品签名
