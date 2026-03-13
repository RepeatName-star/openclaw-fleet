# CLI 使用说明（v0.1）

当前 v0.1 的批量管理能力以 **Control Plane API + Sidecar + CLI** 为主（UI 仍可用于查看实例/任务，但 Campaign/Events/Bundles 等以 CLI 操作为主）。

本文覆盖：
- 实例纳管（Sidecar enroll/heartbeat）
- Labels / Selector / Group（命名 selector）
- Campaign 批量执行（fan-out + best-effort + 动态跟随 selector）
- 事件回显（Events 导出）与诊断（Artifacts）
- 远程 Skill Bundle 分发与安装

---

## 1. 启动控制面（Control Plane）

### 1.1 依赖

- Node.js 18+（推荐 20+）
- pnpm
- Postgres（必须）
- Redis（必须）

如果你使用仓库自带 `docker compose`：

```bash
docker compose up -d
```

### 1.2 配置环境变量

```bash
cp .env.example .env
# 编辑 .env，至少包含：
# PORT=3000
# DATABASE_URL=postgres://openclaw:openclaw@localhost:5432/openclaw_fleet
# REDIS_URL=redis://localhost:6379
# ENROLLMENT_SECRET=change-me
```

### 1.3 运行数据库迁移

你需要按顺序执行 `migrations/` 下的 SQL（v0.1 至少到 004）：

```bash
cat migrations/001_init.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet
cat migrations/002_instance_task_metadata.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet
cat migrations/003_bulk_management_v0_1.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet
cat migrations/004_probe_states.sql | docker exec -i openclaw-fleet-postgres psql -U openclaw -d openclaw_fleet
```

也可以用 `psql "$DATABASE_URL" -f <file>` 的方式执行。

### 1.4 启动控制面

```bash
pnpm install
pnpm build
pnpm ui:build   # 可选：如果你需要 UI
node --env-file=.env dist/index.js
```

控制面默认监听 `http://127.0.0.1:3000/`。

---

## 2. 启动 Sidecar（每个 OpenClaw 实例一份）

Sidecar 负责：
- 向控制面 enroll（换取 device token）
- 周期 heartbeat（online 事实）
- 拉取任务并调用本机 OpenClaw Gateway 执行（含探针/技能安装等）

### 2.1 准备 Sidecar 配置

默认路径：`~/.openclaw-fleet/sidecar.json`

示例（单机同宿主）：

```json
{
  "controlPlaneUrl": "http://127.0.0.1:3000",
  "enrollmentToken": "change-me",
  "provider": "openclaw",
  "pollIntervalMs": 5000,
  "concurrency": 2,
  "statePath": "/home/admin/.openclaw-fleet/sidecar-state.json",
  "openclawGatewayUrl": "ws://127.0.0.1:18789"
}
```

说明：
- `enrollmentToken` 必须与控制面 `.env` 中的 `ENROLLMENT_SECRET` 一致。
- `openclawGatewayUrl` 必须指向 **该实例本机** 的 OpenClaw Gateway WebSocket 地址（端口以你的 OpenClaw 配置为准；本文示例用 `18789`）。
- 网关 token 可不填；Sidecar 会尝试从 `~/.openclaw/openclaw.json` 读取 `gateway.auth.token`（best-effort）。

### 2.2 启动 Sidecar

```bash
pnpm sidecar:start
```

首次启动 enroll 成功后，Sidecar 会把 `deviceToken` 写入 `statePath`，后续可不再依赖 `enrollmentToken`。

---

## 3. CLI 基础用法

### 3.1 基本形式

方式 A：直接跑 TS（开发/本地最方便）

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 <command> [...args]
```

方式 B：先构建再执行（更接近生产）

```bash
pnpm build
node dist/cli/index.js --base-url http://127.0.0.1:3000 <command> [...args]
```

也可以用环境变量：

```bash
FLEET_BASE_URL=http://127.0.0.1:3000 pnpm fleet:cli:ts <command> [...args]
```

CLI 输出为 **JSON 行**（一行一个 JSON 对象），便于 `jq`/重定向处理。

### 3.2 如何拿到 instanceId

当前 CLI v0.1 不提供 `instances list`，你可以用：

```bash
curl http://127.0.0.1:3000/v1/instances
```

或用 UI（如果已 `pnpm ui:build` 并由控制面托管）。

---

## 4. Labels / Selector / Group（命名 selector）

### 4.1 Labels（业务标签）

约束：
- 系统标签：`openclaw.io/*`（只读，v0.1 不允许通过 labels API/CLI 写入）
- 业务标签：必须是 `biz.openclaw.io/*`，且 key/value 必须符合 K8s label 语法

查询：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 labels get <instanceId>
```

设置：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 labels set <instanceId> biz.openclaw.io/env prod
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 labels set <instanceId> biz.openclaw.io/role worker
```

删除：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 labels del <instanceId> biz.openclaw.io/env
```

### 4.2 Selector 语法（对齐 K8s label selector）

支持：
- `key`（exists）
- `!key`（doesNotExist）
- `key=value`
- `key!=value`
- `key in (a,b,c)`
- `key notin (a,b,c)`
- 逗号 `,` 表示 AND

示例：
- `biz.openclaw.io/env=prod,biz.openclaw.io/role in (worker,batch)`
- `!biz.openclaw.io/deprecated,biz.openclaw.io/env!=dev`

### 4.3 Group（命名 selector）

Group 是“命名 Selector”，用于复用与查看匹配集合（不会自动改写实例标签）。

创建：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 groups create \
  --name prod-workers \
  --selector 'biz.openclaw.io/env=prod,biz.openclaw.io/role=worker'
```

列出：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 groups list
```

查看当前匹配实例：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 groups matches <groupId>
```

---

## 5. Campaign（批量执行）

Campaign 是批量执行的一等对象：
- 对 selector 匹配到的实例 **fan-out**（每个实例一份执行）
- **best-effort**：可执行的先跑；Blocked 的会持续提示；条件满足后自动补齐
- **动态跟随** selector：Campaign open 期间，实例进出 scope 会触发 target.added/removed
- `close` 后不再调度新成员，但允许已在跑的回写完成

### 5.1 创建与关闭

列出：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 campaign list
```

创建（例：对 prod worker 执行 `session.reset`）：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 campaign create \
  --name reset-prod-workers \
  --selector 'biz.openclaw.io/env=prod,biz.openclaw.io/role=worker' \
  --action session.reset \
  --payload-json '{"key":"default"}'
```

关闭：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 campaign close <campaignId>
```

### 5.2 常用 action 示例

- `skills.status`（刷新技能快照，通常用于探针/诊断）
```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 campaign create \
  --name refresh-skills \
  --selector 'biz.openclaw.io/env=prod' \
  --action skills.status
```

- `skills.update`（启停/配置某个 skill，payload 具体字段取决于 OpenClaw Gateway 定义）

- `agent.run`（投递一条消息给 agent）

- `memory.replace`（替换 agent memory 文件并 reset session）

---

## 6. 任务回显：Events 导出 + Artifacts 取回

控制面会写入一条 append-only 的事件流（L2），用于回溯与审计：
- Events 默认脱敏（敏感字段：前 4 位 + sha256）
- 原始 payload/result/error 进入 Artifacts（默认开启，30 天保留）

### 6.1 导出事件（JSONL/CSV）

按 campaign 导出（JSONL）：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 events export \
  --format jsonl \
  --campaign-id <campaignId> \
  --out ./campaign-<campaignId>.jsonl
```

常见事件类型（不完全）：
- `target.added` / `target.removed`
- `target.blocked` / `target.unblocked`
- `exec.queued` / `exec.started` / `exec.finished`
- `probe.requested` / `probe.started` / `probe.finished`

### 6.2 取回 Artifact（用于诊断原始数据）

当事件中包含 `artifact_id` 时：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 artifacts get <artifactId>
```

---

## 7. 远程 Skill Bundle 分发（tar.gz）

v0.1 约束（已拍板）：
- 不做信源/签名认证
- 不做 os/arch 兼容性预检
- bundle 格式固定 `tar.gz`
- Sidecar 只从控制面下载，安装到 `~/.openclaw-fleet/skills/<bundleName>`
- Sidecar 会通过 `config.get` + `config.patch` 把 `~/.openclaw-fleet/skills` 加入 `skills.load.extraDirs`

> Sidecar 需要系统里有 `tar` 命令（用于解包）。

### 7.1 打包

假设你的 skill 目录为 `/path/to/my-skill/`（目录内是 skill 文件本身）：

```bash
tar -czf my-skill.tar.gz -C /path/to/my-skill .
```

建议：bundle 内不要再套一层顶级目录（上面的命令会把内容直接打到归档根）。

### 7.2 上传 bundle

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 bundles upload \
  --name my-skill \
  --file ./my-skill.tar.gz
```

CLI 会输出 bundle 元信息（包含 `id`、`sha256` 等），后续安装需要用到。

### 7.3 批量安装 bundle（用 Campaign 下发）

安装 action：`fleet.skill_bundle.install`

payload 必须包含：
- `bundleId`
- `name`（bundleName）
- `sha256`（控制面返回的 sha256）

示例：

```bash
pnpm fleet:cli:ts --base-url http://127.0.0.1:3000 campaign create \
  --name install-my-skill \
  --selector 'biz.openclaw.io/env=prod' \
  --action fleet.skill_bundle.install \
  --payload-json '{"bundleId":"<bundleId>","name":"my-skill","sha256":"<sha256>"}'
```

安装成功后会立即使 `skills_snapshot` 失效，并要求 `skills.status` 探针回写后才会放行（防止“假新”）。

---

## 8. 常见问题（排障）

- 实例一直 `offline`：
  - 检查 Sidecar 是否在跑、`controlPlaneUrl` 是否可达、enroll/heartbeat 是否成功。

- Campaign 一直 Blocked：
  - 导出该 campaign 的 events，查看 `target.blocked` 的 `blocked_reason`。
  - v0.1 Gate 关键事实依赖：`online` / `gateway_reachable` / `version` / `skills_snapshot`。

- Skill bundle 安装失败：
  - 导出 events，找到 `exec.finished` 的 `artifact_id`，再用 `artifacts get` 看原始错误。
  - 常见原因：`tar` 不存在、sha256 不匹配、`config.patch` 失败（baseHash 过期/网关错误）。

