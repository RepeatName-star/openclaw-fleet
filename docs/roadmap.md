# Roadmap

This document captures the post-MVP roadmap based on current tradeoffs and gaps. It is grouped by priority and domain, and can be used as the planning baseline for v0.2+.

## Principles

- Reliability first: task execution and network resilience should be predictable.
- Observability by default: every failure should be explainable from UI and logs.
- Secure by design: authn/authz and audit trails are baseline, not add-ons.
- Scale in layers: add grouping, rollout strategies, and fleet governance incrementally.

## P0 - Reliability and Operability

### Task execution and connectivity
- Strong reconnect + retry policy (exponential backoff + jitter, per-action timeout layers).
- Preserve and surface raw gateway errors and metadata (no lossy transforms).
- Enforce idempotency where applicable (agent.run idempotency keys, retry safety).

### Observability
- Correlate task id across control plane, sidecar, and gateway.
- Add structured error payloads and UI visibility for attempts and failures.
- Optional log shipping or log ingestion hook for centralized debugging.

### Fleet health
- Offline detection and automatic lease expiry.
- Cleanup and requeue strategy for stuck tasks.
- Rate limiting and backpressure for large fleets.

## P1 - Fleet Management

### Grouping and bulk actions
- Make `rollout` actually control pacing/concurrency (batch, canary, staged).
- Add `Policy` for long-term baseline alignment separate from `Campaign`.
- Bring CLI coverage to parity for group/campaign update/delete flows.

### Audit and history
- Immutable audit events for all actions (UI + API + sidecar).
- Advanced filters and export for tasks/events.
- Per-instance history timeline.

### Config governance
- Versioned config templates and diffs.
- Staged rollout with approval gates.
- Rollback and safety checks.

## P2 - Security and Access Control

- RBAC with roles and scopes (API/UI).
- Multi-tenant isolation and namespace scoping.
- Device attestation and artifact signing (sidecar + skills).
- API rate limits and token rotation.

## P3 - UI and Operator Experience

- Realtime UI updates (WebSocket / SSE).
- Global metrics dashboard (success rate, latency, online ratio).
- Notification integration (webhook, email, chat ops).
- Enhanced OpenClaw console embedding and deep links.

## Architecture Evolution

- Decouple scheduler/executor into a worker service.
- Add event bus for task lifecycle and audit events.
- Multi-region control plane with regional sidecars.
- Pluggable providers for non-OpenClaw agents.

## Suggested Milestones

### v0.2 (Stability)
- Campaign rollout engine
- Stronger task/attempt correlation across control plane, sidecar, and gateway
- Artifact/object-storage offload option for large raw payloads/results

### v0.3 (Manageability)
- Policy baseline alignment
- Config templates
- Object storage/CDN backed bundle distribution for cross-region fleets

### v0.4 (Security)
- RBAC + token rotation
- Audit export

### v1.0 (Scale)
- Realtime UI
- Metrics dashboard
- Multi-region readiness

---

# 路线图（中文）

本文档整理当前 MVP 之后的路线图，按优先级和领域分组，作为 v0.2+ 的规划基线。

## 原则

- 可靠性优先：任务执行和网络可用性必须可预期。
- 可观测性优先：每次失败都应可在 UI 和日志中追溯。
- 安全默认：认证、授权与审计为基础能力。
- 分层扩展：先打牢执行能力，再扩展治理能力。

## P0 - 稳定性与可运维性

### 任务执行与连接
- 完整重连与重试策略（指数退避 + 抖动，多层超时）。
- 原样保留网关错误与上下文（不丢信息）。
- 幂等性保障（必要时支持 idempotency key）。

### 可观测性
- 任务 id 贯穿控制面、sidecar、gateway。
- UI 可见 attempts 与错误细节。
- 日志聚合/上报钩子（可选）。

### 机群健康
- 离线检测与租约过期策略。
- 卡住任务的清理与重排机制。
- 大规模场景的限流与背压。

## P1 - 机群管理

### 分组与批量操作
- 标签/分组管理（增删改查）。
- 按组下发任务与回滚。
- 灰度/分批发布策略。

### 审计与历史
- 统一审计事件（UI + API + sidecar）。
- 高级筛选与导出。
- 单实例历史时间线。

### 配置治理
- 配置模板与版本 diff。
- 审批/分阶段发布。
- 回滚与安全检查。

## P2 - 安全与权限

- RBAC 权限模型。
- 多租户隔离。
- 设备/制品签名与校验。
- API 限流与令牌轮换。

## P3 - 交互与体验

- UI 实时更新（WS/SSE）。
- 全局指标面板（成功率、延迟、在线率）。
- 通知集成（webhook/邮件/IM）。
- OpenClaw 控制台嵌入增强。

## 架构演进方向

- 调度/执行解耦为 worker 服务。
- 引入事件总线统一生命周期事件。
- 多区域控制面与区域 sidecar。
- 可插拔 provider 扩展非 OpenClaw 节点。

## 里程碑建议

### v0.2（稳定性）
- 重连 + 重试策略
- UI 错误透明
- 任务/attempt 关联

### v0.3（可管理）
- 标签与分组下发
- 基础审计
- 配置模板

### v0.4（安全）
- RBAC + 令牌轮换
- 审计导出

### v1.0（规模化）
- UI 实时化
- 指标面板
- 多区域准备
