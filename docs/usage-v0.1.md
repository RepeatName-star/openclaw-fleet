# OpenClaw Fleet v0.1 使用说明

本文描述当前 `openclaw-fleet` 已支持的功能面、每个 action 的参数、预期效果，以及排障时该看哪里。

如果你主要关心 `Campaign` 字段语义、`Gate` / `Rollout` 边界和常用 payload 模板，另见：
- `docs/campaign-manual.md`

适用版本：
- Control Plane: 当前 `master` 上的 v0.1 实现
- OpenClaw Gateway: 以 `/home/ldx/codex/agent-swarm/openclaw` 当前源码语义为准

## 1. 当前对象模型

控制面当前围绕 8 个对象工作：

- `Instance`：被纳管的 OpenClaw 实例。控制面不区分它来自云主机、K8s、还是 NAT 边缘设备。
- `Label`：贴在 Instance 上的键值对。系统标签只读：`openclaw.io/*`；业务标签可写：`biz.openclaw.io/*`。
- `Group`：命名 selector，不是静态成员列表。本质上是一个可复用的 K8s 风格 label selector。
- `Campaign`：批量执行的一等对象。对 selector 匹配到的实例做 fan-out，并在 open 状态下动态跟随成员变化。
- `Task`：单实例执行单元。既可以直接创建，也可以由 Campaign fan-out 生成。
- `Event`：append-only 审计事件流。默认脱敏，可导出 `JSONL`/`CSV`。
- `Artifact`：存放原始 payload/result/error。默认保留 30 天，用于深度排查。
- `Skill Bundle`：控制面托管的 `tar.gz` 技能包。由 Sidecar 下载并安装到 `~/.openclaw-fleet/skills/<bundleName>`。

## 2. 当前支持的功能点

### 2.1 实例接入与保活

支持：
- `POST /v1/enroll` 以 enrollment secret 换取 device token
- `POST /v1/heartbeat` 刷新在线状态
- Sidecar 周期轮询 `/v1/tasks/pull` 并回写 `/v1/tasks/ack`

预期效果：
- UI / API 中可看到 `online` 状态
- 实例可以接收 direct task / campaign fan-out 任务

### 2.2 Labels

支持：
- 查询实例标签
- 新增/覆盖业务标签
- 删除业务标签

约束：
- 业务标签 key 必须是 `biz.openclaw.io/*`
- 系统标签 `openclaw.io/*` 只读
- key/value 必须通过 K8s label 语法校验

预期效果：
- Labels 可作为 Group / Campaign selector 的匹配条件
- 每条 Event 会冗余写入“当时的 labels 全量快照”

### 2.3 Groups

支持：
- 创建/更新/删除 Group
- 查看 Group 当前命中的实例
- 在 UI 的 Campaign 创建页直接选 Group，把 selector 自动带入表单

边界：
- Group 不是静态成员集合
- Group 不会自动修改实例标签

### 2.4 Campaigns

支持：
- 创建 / 更新 / 关闭 / 删除已关闭 Campaign
- selector fan-out
- 动态跟随 selector 成员变化
- best-effort 执行
- blocked 实例持续保留，条件满足后自动补齐
- `generation` 仅在 `action/payload` 变化时递增
- `rollout` 字段可保存，但当前 reconciler 还不会按它做分批/限流
- 删除后 Campaign 会从列表中隐藏，但历史事件仍可继续按原 `campaign_id` 检索

selector 约束：
- 必须填写完整合法的 K8s 风格 label selector。
- `biz.openclaw.io/` 这类“只写前缀”的字符串不是合法 selector，会被服务端拒绝。
- 如果想批量命中，请写明确条件，例如 `biz.openclaw.io/openclaw=true`。

当前 Gate 依赖的 Fact：
- `online`
- `gateway_reachable`
- `version`
- `skills_snapshot`

当前 Gate 生效方式：
- `online`：所有 Campaign action 都需要
- `gateway_reachable`：所有 gateway-bound action 都需要，`fleet.gateway.probe` 例外
- `version`：仅当 `gate.minVersion` 显式设置为非零值时才检查
- `skills_snapshot`：当前只阻塞技能变更类 action：`skills.install`、`skills.update`、`fleet.skill_bundle.install`

### 2.5 Direct Tasks

支持：
- 直接向单实例创建任务：`POST /v1/tasks`
- direct task 创建时会写一条 `exec.queued` 事件
- 该事件自带脱敏 payload；原始 payload 进入 `task.payload` artifact

边界：
- direct task 只支持 `target_type="instance"`
- 批量执行统一走 `Campaign`，不再支持 `target_type="group"`

### 2.6 Events / Artifacts

支持：
- UI 查看 Events
- 按 `campaign_id` / `instance_id` / `event_type` 筛选
- 导出 `JSONL` / `CSV`
- 按 `artifact_id` 查看 Artifact

保留策略：
- Events: 90 天滚动删除
- Artifacts: 默认 30 天

### 2.7 Skill Bundles

支持：
- 上传 bundle
- 下载 bundle
- 删除 bundle
- 用 direct task / campaign 分发安装
- bundle 安装成功后自动使 `skills_snapshot` 失效，等待下次 `skills.status` 回写

当前 bundle 约束：
- 格式固定为 `tar.gz`
- 不做信源/签名认证
- 不做 `os/arch` 兼容性预检
- Sidecar 只从控制面下载

安装行为：
- 落地目录：`~/.openclaw-fleet/skills/<bundleName>`
- 如果 bundle 内只有一层顶级目录，安装器会自动拍平
- Sidecar 会调用 `config.get`，再用返回的 `hash` 作为 `config.patch.baseHash`
- 通过 `skills.load.extraDirs` 把 `~/.openclaw-fleet/skills` 加入 OpenClaw 的技能扫描路径

## 3. Action 参考

### 3.1 `skills.status`

适用：
- Direct task
- Campaign

推荐 payload：
```json
{}
```

可选字段：
```json
{
  "agentId": "main"
}
```

预期效果：
- 调用 OpenClaw Gateway 的 `skills.status`
- 在实例表上刷新 `skills_snapshot` 与 `skills_snapshot_at`
- 作为 Gate 的 `skills_snapshot` 事实来源

注意：
- v0.1 的 fleet facts 面向“实例级快照”；运营上建议默认使用空对象

### 3.2 `fleet.gateway.probe`

适用：
- Direct task
- Campaign

payload：
```json
{}
```

预期效果：
- 探测 gateway 是否可达
- 刷新 `gateway_reachable`
- 如果 hello 带版本信息，会刷新 `openclaw_version`

### 3.3 `fleet.skill_bundle.install`

适用：
- Direct task
- Campaign

payload：
```json
{
  "bundleId": "<bundleId>",
  "name": "demo-skill",
  "sha256": "<sha256>"
}
```

预期效果：
- Sidecar 从控制面下载 bundle
- 校验 sha256
- 解压到 `~/.openclaw-fleet/skills/<name>`
- 自动拍平单层顶级目录归档
- 调用 `config.get` + `config.patch`
- 使 `skills_snapshot` 立即失效，等待探针回写

### 3.4 `skills.update`

适用：
- Direct task
- Campaign

payload：
```json
{
  "skillKey": "weather",
  "enabled": true,
  "apiKey": "",
  "env": {
    "FOO": "bar"
  }
}
```

字段说明：
- `skillKey`: 必填
- `enabled`: 可选，开关 skill
- `apiKey`: 可选，空字符串表示清空
- `env`: 可选，空字符串 value 表示清空该 env

### 3.5 `skills.install`

适用：
- Direct task
- Campaign

payload：
```json
{
  "name": "weather",
  "installId": "<installId>",
  "timeoutMs": 300000
}
```

字段说明：
- `name`: 必填，技能名
- `installId`: 必填，上游安装请求 ID
- `timeoutMs`: 可选，最小 1000

### 3.6 `config.patch`

适用：
- Direct task
- Campaign

payload：
```json
{
  "raw": "{\n  \"skills\": {\n    \"load\": {\n      \"extraDirs\": [\"/path\"]\n    }\n  }\n}",
  "baseHash": "<config.get.hash>",
  "note": "fleet update",
  "sessionKey": "agent:main:main",
  "restartDelayMs": 0
}
```

字段说明：
- `raw`: 必填，字符串形式的 JSON / JSON5 patch
- `baseHash`: 实例已有配置时必填，取自 `config.get.hash`
- `note`: 可选
- `sessionKey`: 可选
- `restartDelayMs`: 可选

### 3.7 `memory.replace`

适用：
- Direct task
- Campaign

payload：
```json
{
  "agentId": "main",
  "content": "# New memory",
  "fileName": "MEMORY.md"
}
```

字段说明：
- `agentId`: 必填
- `content`: 必填
- `fileName`: 可选，默认 `MEMORY.md`

预期效果：
- 调用 Gateway `agents.files.set`
- 只替换 memory 文件，不会隐式重置 session

如果你需要重置会话：
- 请显式再下发一次 `session.reset`

### 3.8 `session.reset`

适用：
- Direct task
- Campaign

payload：
```json
{
  "key": "agent:main:main"
}
```

字段说明：
- `key`: 必填，必须是目标实例上真实存在的 Gateway session key

注意：
- 这是最容易“表面成功但没有达到你想要的业务效果”的 action
- 如果传错 key，可能 reset 的不是你以为的会话
- 对 Campaign 而言，只适合所有目标实例都共享同名 session key 的场景

### 3.9 `agent.run`

适用：
- Direct task
- Campaign

payload：
```json
{
  "message": "Run diagnostics",
  "agentId": "main",
  "sessionKey": "agent:main:main",
  "idempotencyKey": "<optional>",
  "timeoutMs": 300000
}
```

字段说明：
- `message`: 必填
- `agentId`: 可选
- `sessionKey`: 可选
- `idempotencyKey`: 可选；不填时 Sidecar 自动生成
- `timeoutMs`: 可选；单位毫秒，默认 `300000`

预期效果：
- Sidecar 调用 Gateway `agent`
- Fleet 默认加上 `deliver: false`
- Sidecar 默认等待最终响应 5 分钟；可通过 `timeoutMs` 覆盖
- 更像“远程执行一次 agent run 并拿回结果”，不是默认往外部渠道发消息

## 4. 审计与回显怎么看

常见事件：
- `exec.queued`
- `exec.started`
- `exec.finished`
- `target.added`
- `target.removed`
- `target.blocked`
- `target.unblocked`
- `probe.requested`
- `probe.started`
- `probe.finished`

怎么看：
- 想知道“发了什么任务”：看 `exec.queued`
- 想知道“执行结果/报错是什么”：看 `exec.finished` 的 artifact
- 想知道“为什么 blocked”：看 `target.blocked` 的 `facts_snapshot`

## 5. UI / CLI / API 分工

### 5.1 UI 当前适合做什么

- 看实例
- 管 labels
- 管 groups
- 管 campaigns（创建 / 编辑 / 关闭 / 删除已关闭项）
- 查看 events / artifacts
- 上传 / 删除 / 分发 skill bundles

### 5.2 CLI 当前适合做什么

- 脚本化调用当前已实现的子集命令
- 导出 events
- bundles 上传 / 删除
- labels 基础操作
- groups 的 list/create/matches
- campaigns 的 list/create/close

### 5.3 API 当前适合做什么

- 做你自己的集成
- 做上层 UI
- 做自动化脚本

## 6. 已知边界

- Group 是命名 selector，不是静态机器组
- Gate 只检查并阻塞，不做修复
- `rollout` 当前只是预留字段，不会改变调度行为
- v0.1 还没有 Policy 层
- 还没有多租户 / RBAC
- 还没有任意宿主机脚本执行
- Skill bundle 还没有签名校验

## 7. 推荐验收路径

建议按下面顺序验收：

1. 先看 `Instances` 页面确认实例都在线
2. 给几台机器打 `biz.openclaw.io/*` 标签
3. 建一个 Group，确认 matches 正确
4. 用 Group 创建一个 `skills.status` Campaign
5. 在 Events 里确认 `target.added` / `exec.queued` / `exec.finished`
6. 上传一个 Skill Bundle
7. 先 direct task 安装到单机，再 Campaign 分发到标签集合
8. 用 `artifacts` 看原始错误和结果
