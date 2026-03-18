# Campaign 使用手册（v0.1.1）

本文专门描述 `Campaign` 在当前 `openclaw-fleet` v0.1 / v0.1.1 实现中的实际用法，包括字段语义、`Gate` / `Rollout` 的当前边界、常用 action 的 payload 写法，以及运营上最容易踩坑的限制。

如果你需要完整对象模型与所有 action 的全量说明，另见：
- `docs/usage-v0.1.md`
- `docs/api.md`
- `docs/cli.md`

## 1. Campaign 是什么

`Campaign` 是当前唯一受支持的批量执行一等对象：

- 它先用 `selector` 选出一批实例。
- 然后按实例 fan-out，一台实例对应一条实际执行任务。
- 它是 `best-effort` 的：
  - 当前满足条件的实例先执行。
  - 不满足条件的实例进入 `blocked`。
  - 后续条件满足后，控制面会自动补齐执行。
- 它是动态的：
  - 在 `open` 状态下，selector 新匹配到的实例会自动进入 scope。
  - 不再匹配的实例会被移出当前 generation 的待执行集合。

要点：
- `Campaign` 是当前推荐的批量执行方式。
- `POST /v1/tasks` 的 `target_type="group"` 已在 v0.1.1 明确拒绝。
- `Group` 只负责复用 selector，不负责执行。

## 2. 通用字段

创建 / 更新 `Campaign` 时主要关心这些字段：

```json
{
  "name": "prod-skills-status",
  "selector": "biz.openclaw.io/env=prod,biz.openclaw.io/openclaw=true",
  "action": "skills.status",
  "payload": {},
  "gate": {},
  "rollout": {},
  "expires_at": "2026-12-31T00:00:00.000Z"
}
```

字段说明：

- `name`
  - 给人看的名字，不参与调度逻辑。

- `selector`
  - K8s 风格 label selector。
  - 只匹配 labels，不检查在线状态、gateway 可达性、版本或 skills 快照。
  - 必须是完整合法的 selector 表达式；像 `biz.openclaw.io/` 这样的前缀片段会被服务端直接拒绝。
  - 不支持“按前缀匹配所有业务标签”这种通配语义；如果要批量命中，请写成明确条件，例如 `biz.openclaw.io/openclaw=true`。

- `action`
  - 每个命中实例实际执行的动作。

- `payload`
  - 传给 `action` 的参数。

- `gate`
  - 准入检查配置。
  - 当前真正会被服务端读取的只有 `minVersion`。

- `rollout`
  - 设计上用于分批、并发、节奏控制。
  - 当前 v0.1.1 仍是预留字段，服务端会保存，但不会实际改变调度行为。

- `expires_at`
  - 可选。
  - 到期后 `Campaign` 会自动转为 `closed`，不再调度新成员。

## 3. 生命周期与删除规则

状态相关规则：

- 新建后默认是 `open`
- `close` 后不再接纳新成员
- 已经在跑的任务允许继续回写
- 只有 `closed` 的 `Campaign` 允许删除

删除语义：

- 只删除 `Campaign` 控制面对象本身
- 不删除历史 tasks
- 不删除历史 events
- 不删除历史 artifacts
- 已删除 Campaign 会从列表和详情接口中隐藏
- 但底层会保留一个 tombstone，使历史事件仍可按原 `campaign_id` 检索

这意味着：

- 删除是“停止继续管理并清理控制面对象”
- 不是“抹掉历史”

## 4. Generation 规则

`Campaign` 有一个很关键的字段：`generation`。

当前规则：

- 只有 `action` 或 `payload` 变化时，`generation` 才会递增。
- 修改 `selector` / `gate` / `rollout` / `expires_at` 不会递增 `generation`。

这意味着：

- 已经在当前 generation 上执行过的实例，不会因为你改了 `gate` 或 `rollout` 再自动执行一次。
- 如果你要对同一批实例重新执行，应该：
  - 修改 `action/payload` 触发新 generation；或
  - 新建一个新的 `Campaign`。

## 5. Gate 怎么用

`Gate` 的职责是：

- 检查实例当前是否满足执行前置条件。
- 只会阻塞，不会自动修复实例。

### 5.1 当前存在的 4 个 Fact

当前 v0.1.1 仍然围绕这 4 个 fact 工作：

- `online`
- `gateway_reachable`
- `openclaw_version`
- `skills_snapshot`

当前实现的事实含义：

- `online`
  - 来自 sidecar heartbeat。
  - 90 秒内有心跳才算在线。

- `gateway_reachable`
  - 来自 `fleet.gateway.probe`。
  - 30 秒内探针结果必须为 `true` 才算新鲜。

- `openclaw_version`
  - 来自 `fleet.gateway.probe` 的版本信息。
  - 只有在显式设置 `gate.minVersion` 时才会真的参与阻塞判断。

- `skills_snapshot`
  - 来自 `skills.status`。
  - 10 分钟内必须新鲜。
  - 若发生过技能变更并使快照失效，必须等新的 `skills.status` 回写后才重新通过。

### 5.2 当前可配置项

当前 `gate` 里真正会被读取的只有一个字段：

```json
{
  "minVersion": "2026.2.26"
}
```

常见写法：

- 不设额外版本门槛：

```json
{}
```

- 要求目标版本不低于某个值：

```json
{
  "minVersion": "2026.2.26"
}
```

### 5.3 v0.1.1 的 action-aware Gate 规则

这是 v0.1.1 和早期实现差异最大的地方。

当前 Gate 不是“4 个 fact 对所有 action 一刀切”，而是按 action 家族生效：

- `online`
  - 所有 Campaign action 都需要。

- `gateway_reachable`
  - 所有 gateway-bound action 都需要。
  - `fleet.gateway.probe` 自己例外，因为它本身就是用来刷新这个 fact 的。

- `openclaw_version`
  - 只有在显式设置 `gate.minVersion` 时才检查。
  - 未设置 `minVersion` 时，不会因为版本缺失 / 不可解析而阻塞。

- `skills_snapshot`
  - 当前只阻塞技能变更类 action：
    - `skills.install`
    - `skills.update`
    - `fleet.skill_bundle.install`
  - `agent.run` / `session.reset` / `memory.replace` / `fleet.config_patch` / `fleet.gateway.probe` 不会因为 `skills_snapshot` 缺失或过期被误拦。

### 5.4 关键边界

这里最重要的现实边界有 3 个：

- `Gate` 仍然只会 block，不会 repair。
- `Gate` 现在已经 action-aware，但不是“任意 payload 语义感知”。
- `skills_snapshot` 的阻塞范围当前是实现上硬编码的动作集合，不是用户可配置规则。

## 6. Rollout 怎么用

`Rollout` 的原始设计目的是：

- 控制批量节奏
- 控制并发
- 做分批 / canary / staged rollout

但当前 v0.1.1 里：

- API 会接收并保存 `rollout`
- UI 也允许填写 `rollout`
- Reconciler 还不会实际读取它来控制调度

所以当前建议：

```json
{}
```

如果你现在填写类似：

```json
{
  "batchSize": 10,
  "maxParallel": 2
}
```

当前也只会被保存，不会改变执行行为。

## 7. Action / Payload 模板

### 7.1 `skills.status`

用途：
- 刷新实例的 skills 快照。

payload：

```json
{}
```

适合场景：
- 先刷新 `skills_snapshot`
- 给 blocked 的技能相关任务补探针

### 7.2 `fleet.gateway.probe`

用途：
- 刷新 `gateway_reachable` 和 `openclaw_version`

payload：

```json
{}
```

适合场景：
- 主动刷新 gateway 可达性与版本事实
- 解开因 `gateway_reachable` / `minVersion` 导致的阻塞

### 7.3 `fleet.skill_bundle.install`

用途：
- 分发并安装 Fleet 托管的 skill bundle

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
- 自动拍平单层目录归档
- 自动执行每台实例各自的 `config.get + config.patch`
- 立即使 `skills_snapshot` 失效，等待新探针回写

建议：
- 这是批量分发 skill 的首选 action。

### 7.4 `fleet.config_patch`

用途：
- 用 Fleet 的高层包装动作批量修改 OpenClaw 配置

payload：

```json
{
  "raw": "{\n  \"models\": {\n    \"default\": \"zai/glm-5-turbo\"\n  }\n}",
  "note": "switch default model",
  "sessionKey": "agent:main:main",
  "restartDelayMs": 500
}
```

预期效果：
- Sidecar 先对每台实例执行 `config.get`
- 自动读取该实例自己的 `hash/baseHash`
- 再调用 OpenClaw 原生 `config.patch`
- 如果第一次 patch 遇到 stale-hash 冲突，会自动重新 `config.get` 后重试一次

Merge Patch 语义：
- 对象递归合并
- `null` 删除字段
- 数组默认整体替换
- 数组元素若是带 `id` 的对象，则按 `id` 合并

运营建议：
- 这是 Fleet 里批量改配置的默认入口。
- 例如要批量切换后端模型到 `zai/glm-5-turbo`，优先用这个 action。

### 7.5 `skills.update`

用途：
- 修改已有 skill 的启用状态、apiKey 或 env

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

说明：
- `skillKey` 必填
- `enabled` 可选
- `apiKey` 可选，空字符串表示清空
- `env` 可选，value 为空字符串表示清空该 env

### 7.6 `skills.install`

用途：
- 调用 OpenClaw 原生远程技能安装逻辑

payload：

```json
{
  "name": "weather",
  "installId": "<installId>",
  "timeoutMs": 300000
}
```

说明：
- `name` 必填
- `installId` 必填
- `timeoutMs` 可选，最小 1000

### 7.7 `config.patch`

用途：
- 远程调用 OpenClaw Gateway 的 `config.patch`
- 对当前实例配置做局部 merge patch，并触发网关重启

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

- `raw`
  - 必填
  - 必须是字符串形式的 JSON / JSON5 patch，不是对象本身

- `baseHash`
  - 通常建议必填
  - 需要先从对应实例的 `config.get.hash` 获取

- `note`
  - 可选

- `sessionKey`
  - 可选

- `restartDelayMs`
  - 可选

运营建议：

- `config.patch` 很强，但不适合做“随手批量改配置”的默认工具。
- 因为 `baseHash` 是按实例当前配置生成的：
  - 同一个 payload 发给一组配置不一致的实例时，可能失败。
- 如果你的目标只是批量改配置，优先使用 `fleet.config_patch`。
- 如果你的目标只是分发 skill 目录，优先使用 `fleet.skill_bundle.install`，不要直接手写 `config.patch`。

### 7.8 `memory.replace`

用途：
- 覆盖 agent memory 文件

payload：

```json
{
  "agentId": "main",
  "content": "# New memory",
  "fileName": "MEMORY.md"
}
```

说明：
- `agentId` 必填
- `content` 必填
- `fileName` 可选，默认 `MEMORY.md`

注意：
- v0.1.1 起，`memory.replace` 不再隐式 reset session。
- 如果你想重置会话，请再显式下发一次 `session.reset`。

### 7.9 `session.reset`

用途：
- 重置指定 session

payload：

```json
{
  "key": "agent:main:main"
}
```

说明：
- `key` 必填
- 对 `Campaign` 而言，只适合所有目标实例都共享同名 session key 的场景

### 7.10 `agent.run`

用途：
- 批量让目标实例执行一次 agent run，并等待最终结果

payload：

```json
{
  "message": "Run diagnostics",
  "agentId": "main",
  "sessionKey": "agent:main:main",
  "timeoutMs": 300000
}
```

说明：
- `message` 必填
- `agentId` 可选
- `sessionKey` 可选
- `timeoutMs` 可选，默认 300000 ms

注意：
- Fleet 会强制 `deliver: false`
- 它更像“远程跑一次 agent 并拿结果”，不是默认往外部渠道发消息

## 8. 常用模板

### 8.1 刷新一批实例的技能快照

```json
{
  "name": "refresh-skills",
  "selector": "biz.openclaw.io/env=prod",
  "action": "skills.status",
  "payload": {},
  "gate": {},
  "rollout": {}
}
```

### 8.2 给一批实例做 gateway/version 探针

```json
{
  "name": "probe-prod",
  "selector": "biz.openclaw.io/env=prod",
  "action": "fleet.gateway.probe",
  "payload": {},
  "gate": {},
  "rollout": {}
}
```

### 8.3 批量分发一个 skill bundle

```json
{
  "name": "install-demo-skill",
  "selector": "biz.openclaw.io/openclaw=true",
  "action": "fleet.skill_bundle.install",
  "payload": {
    "bundleId": "<bundleId>",
    "name": "demo-skill",
    "sha256": "<sha256>"
  },
  "gate": {},
  "rollout": {}
}
```

### 8.4 对一批实例执行 agent.run

```json
{
  "name": "batch-diagnostics",
  "selector": "biz.openclaw.io/role=worker",
  "action": "agent.run",
  "payload": {
    "message": "Run diagnostics and report current status",
    "agentId": "main",
    "timeoutMs": 300000
  },
  "gate": {},
  "rollout": {}
}
```

## 9. 如何排障

排查 `Campaign` 时，优先看这几类事件：

- `target.added`
  - 某个实例进入了当前 generation 的目标集合

- `target.blocked`
  - 被 gate 阻塞
  - 重点看 `payload.blocked_reason` 和 `facts_snapshot`

- `target.unblocked`
  - 原先阻塞的实例恢复可执行

- `exec.queued`
  - 已经真正下发到实例任务队列

- `exec.started`
  - Sidecar 已经拉到任务并开始执行

- `exec.finished`
  - 看 `artifact_id` 对应的 `task.result` / `task.error`

如果你怀疑是 payload 写错：

- 先看 `exec.queued` 事件里的脱敏摘要
- 再去对应 `artifact_id` 看原始 `task.payload`

如果你怀疑是实例条件不满足：

- 先查 `target.blocked`
- 再看里面的 `facts_snapshot`

## 10. 当前最重要的边界

当前最容易误解的 5 个点：

- `selector` 只负责“选中谁”，不负责“能不能跑”
- `Gate` 已经是 action-aware，但只覆盖当前硬编码的动作家族，不是任意 payload 语义分析
- `rollout` 当前还没有实际调度效果
- `memory.replace` 不再隐式 reset session
- 删除 `Campaign` 不会抹掉历史审计数据
