# Task Detail And Memory Follow-up Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make task detail show the real execution outcome and timeline for a single task, and make the file/memory workspace feel responsive and unambiguous during instance/file switching.

**Architecture:** Promote `task_id` to a first-class field on `events` so both single-task and campaign flows can be queried directly without parsing JSON payloads. Keep the file editor purely UI-side for this pass: add per-instance/per-file client caching, explicit refresh, and stale-response guards instead of changing the control-plane file APIs.

**Tech Stack:** TypeScript, Fastify, Postgres, React 18, Vitest, Testing Library

### Task 1: Reproduce the new behavior gaps with failing tests

**Files:**
- Modify: `tests/events-api.test.ts`
- Modify: `tests/ui/task-detail-page.test.tsx`
- Modify: `tests/ui/files-page.test.tsx`
- Reference: `src/routes/events.ts`
- Reference: `ui/src/pages/TaskDetail.tsx`
- Reference: `ui/src/pages/Memory.tsx`

**Step 1: Write the failing backend and UI tests**

Add coverage for:
- `GET /v1/events` supports `task_id` filtering
- task detail loads related task events and surfaces the latest result artifact content
- task detail shows an event timeline for the current task
- memory page caches file content per instance/file pair
- memory page exposes refresh/save actions in the editor header
- switching instances clears the editor immediately before the next file content resolves
- stale file responses are ignored when the user switches instances/files quickly

**Step 2: Run the focused tests and verify they fail**

Run:
```bash
pnpm exec vitest run tests/events-api.test.ts tests/ui/task-detail-page.test.tsx tests/ui/files-page.test.tsx
```

Expected: FAIL because events cannot filter by `task_id`, task detail only shows task/attempts, and memory page has no cache/refresh/anti-stale protection.

**Step 3: Commit the reproduction-only changes**

```bash
git add tests/events-api.test.ts tests/ui/task-detail-page.test.tsx tests/ui/files-page.test.tsx
git commit -m "test: reproduce task detail and memory follow-up gaps"
```

### Task 2: Add first-class `task_id` support to events

**Files:**
- Create: `migrations/007_events_task_id.sql`
- Modify: `src/events/store.ts`
- Modify: `src/routes/events.ts`
- Modify: `src/routes/tasks-admin.ts`
- Modify: `src/routes/tasks-pull.ts`
- Modify: `src/routes/tasks-ack.ts`
- Modify: `tests/events-api.test.ts`
- Modify: `tests/db.test.ts`

**Step 1: Write or extend the failing persistence tests first**

Cover:
- schema migration adds nullable `events.task_id`
- existing rows can be backfilled from `payload.task_id`
- event listing/export accepts `task_id` and returns matching rows only

**Step 2: Run the focused tests and confirm RED**

Run:
```bash
pnpm exec vitest run tests/events-api.test.ts tests/db.test.ts
```

Expected: FAIL because the schema/query layer does not know about `task_id`.

**Step 3: Implement the minimal backend changes**

- add `events.task_id uuid null`
- backfill `task_id` from `payload->>'task_id'` where the payload contains a UUID-like string
- add `events_task_id_idx`
- extend `insertEvent()` to accept `task_id`
- pass `task_id` explicitly from task queue, lease, and ack event writes
- extend `/v1/events` and `/v1/events/export` query parsing/filtering/select list to include `task_id`

**Step 4: Re-run the focused tests and confirm GREEN**

Run:
```bash
pnpm exec vitest run tests/events-api.test.ts tests/db.test.ts
```

Expected: PASS.

**Step 5: Commit**

```bash
git add migrations/007_events_task_id.sql src/events/store.ts src/routes/events.ts src/routes/tasks-admin.ts src/routes/tasks-pull.ts src/routes/tasks-ack.ts tests/events-api.test.ts tests/db.test.ts
git commit -m "feat(events): add first-class task event linkage"
```

### Task 3: Enrich task detail with result summary and task timeline

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/types.ts`
- Modify: `ui/src/pages/TaskDetail.tsx`
- Modify: `ui/src/styles.css`
- Modify: `tests/ui/task-detail-page.test.tsx`
- Reference: `ui/src/pages/Operations.tsx`

**Step 1: Write the failing task detail assertions first**

Cover:
- task detail requests `/v1/events?task_id=...`
- latest result/error artifact is shown in a dedicated “最终结果” block
- `agent.run` prefers the final payload text over raw nested metadata when available
- task timeline renders related events in time order with payload/artifact previews

**Step 2: Run the focused UI test and confirm RED**

Run:
```bash
pnpm exec vitest run tests/ui/task-detail-page.test.tsx
```

Expected: FAIL because the page has no event/result section.

**Step 3: Implement the minimal UI changes**

- add `task_id` support to `listEventsPage()`
- add task-related event/artifact types if needed
- load task, attempts, and task events together
- fetch the newest artifact referenced by task events for the result summary
- normalize `agent.run` display to prefer `result.result.payloads[].text`
- render an event timeline below attempts with scroll-safe JSON previews

**Step 4: Re-run the focused UI test and confirm GREEN**

Run:
```bash
pnpm exec vitest run tests/ui/task-detail-page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add ui/src/api/client.ts ui/src/types.ts ui/src/pages/TaskDetail.tsx ui/src/styles.css tests/ui/task-detail-page.test.tsx
git commit -m "feat(ui): show task results and timeline"
```

### Task 4: Add cached, refreshable file loading with stale-response protection

**Files:**
- Modify: `ui/src/pages/Memory.tsx`
- Modify: `ui/src/styles.css`
- Modify: `tests/ui/files-page.test.tsx`

**Step 1: Write the failing file editor tests first**

Cover:
- opening a previously loaded file reuses cached content immediately
- refresh bypasses cache and reloads the current file
- save button lives in the editor header beside refresh
- switching instance clears file title/content immediately
- late responses from the previous instance/file do not overwrite the current editor state
- the page shows cache freshness hints (“上次加载时间”, “当前为缓存内容，可点击刷新获取最新版本”)

**Step 2: Run the focused UI test and confirm RED**

Run:
```bash
pnpm exec vitest run tests/ui/files-page.test.tsx
```

Expected: FAIL because the page always refetches, does not clear the editor on instance switch, and has no refresh/cached-state messaging.

**Step 3: Implement the minimal UI changes**

- keep a cache map keyed by `${instanceId}:${fileName}`
- cache the file list per instance and file content per instance/file
- when switching instances:
  - clear editor title/content immediately
  - clear success/error tied to the previous file
  - restore cached list/content if available
- add request versioning or an `AbortController`-style guard so stale async responses are ignored
- add editor-header actions: `刷新` and `保存文件`
- make `刷新` bypass cache and update freshness timestamps
- show “当前为缓存内容，可点击刷新获取最新版本” when serving cached content
- show “上次加载时间” for the visible file content

**Step 4: Re-run the focused UI test and confirm GREEN**

Run:
```bash
pnpm exec vitest run tests/ui/files-page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add ui/src/pages/Memory.tsx ui/src/styles.css tests/ui/files-page.test.tsx
git commit -m "fix(ui): speed up file editor with cache and refresh"
```

### Task 5: Run full verification and prepare branch for user testing

**Files:**
- Modify: `docs/plans/2026-03-20-task-detail-memory-followup.md`

**Step 1: Run the full verification suite**

Run:
```bash
pnpm exec vitest run --pool forks --poolOptions.forks.singleFork
pnpm build
pnpm ui:build
```

Expected: PASS with no failed tests and successful server/UI builds.

**Step 2: Review diff and status**

Run:
```bash
git status --short
git diff --stat
```

Expected: only the intended files are modified.

**Step 3: Commit final polish if needed**

```bash
git add .
git commit -m "fix: finish task detail and memory follow-up polish"
```

