# Fleet Config Patch Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Fleet-native `fleet.config_patch` action that lets operators batch-apply OpenClaw config merge patches without manually fetching or grouping by per-instance `baseHash`.

**Architecture:** Keep OpenClaw's native `config.patch` untouched as the low-level expert path. Add a sidecar-level wrapper that does `config.get -> config.patch(baseHash)` per instance, retries once on the known stale-hash race, and expose the new action in the existing Fleet UI/docs so operators use the ergonomic path by default.

**Tech Stack:** TypeScript, Fastify, React 18, Vitest, Testing Library.

## Confirmed Product Decisions

- New ergonomic action name: `fleet.config_patch`
- Implementation layer: sidecar/executor, not control-plane synthesis only
- Native `config.patch` remains supported for expert/manual workflows
- `fleet.config_patch` operator payload should not require `baseHash`
- Fleet should resolve per-instance hash automatically via `config.get`
- On OpenClaw's stale-hash error (`config changed since last load; re-run config.get and retry`), Fleet should re-read config and retry once
- This action should be available for direct tasks and Campaigns
- Memory/Persona UI should prefer the ergonomic Fleet action instead of making operators paste `baseHash`

### Task 1: Lock the sidecar behavior with failing tests

**Files:**
- Modify: `tests/sidecar/executor.test.ts`
- Modify: `tests/gate/evaluate.test.ts`
- Reference: `src/sidecar/executor.ts`
- Reference: `src/gate/evaluate.ts`

**Step 1: Write the failing tests**

Add tests that assert:
- `fleet.config_patch` calls `configGet()` first and then `configPatch()` with the returned hash as `baseHash`
- `fleet.config_patch` retries once when the first patch fails with OpenClaw's stale-hash error and uses the refreshed hash on retry
- `fleet.config_patch` is treated like other gateway-bound but non-skill-mutating actions in gate evaluation (no `skills_snapshot` requirement)

Suggested test shape:

```ts
test("executor auto-resolves baseHash for fleet.config_patch", async () => {
  const calls: string[] = [];
  const provider = {
    configGet: async () => {
      calls.push("get");
      return { hash: "h1" };
    },
    configPatch: async (params: any) => {
      calls.push(`patch:${params.baseHash}`);
    },
  } as any;

  const exec = createExecutor({ provider, state: { executed: {} } as any });
  const res = await exec.run([
    { id: "t1", action: "fleet.config_patch", payload: { raw: "{\"models\":{}}" } } as any,
  ]);

  expect(res.failed).toBe(0);
  expect(calls).toEqual(["get", "patch:h1"]);
});
```

**Step 2: Run focused tests to verify RED**

Run:

```bash
pnpm test -- tests/sidecar/executor.test.ts tests/gate/evaluate.test.ts
```

Expected: FAIL because `fleet.config_patch` is not implemented yet.

**Step 3: Commit the failing tests once RED is confirmed**

```bash
git add tests/sidecar/executor.test.ts tests/gate/evaluate.test.ts
git commit -m "test: reproduce fleet config patch behavior"
```

### Task 2: Implement the sidecar wrapper with minimal code

**Files:**
- Create: `src/sidecar/config-patch.ts`
- Modify: `src/sidecar/executor.ts`
- Modify: `src/sidecar/providers/types.ts`
- Test: `tests/sidecar/executor.test.ts`

**Step 1: Write the minimal helper**

Create a helper that:
- accepts `raw`, `note`, `sessionKey`, `restartDelayMs`
- runs `configGet()`
- extracts `baseHash` from `baseHash` or `hash`
- calls `configPatch()`
- if the first patch throws the stale-hash error, re-runs `configGet()` and retries once

Suggested shape:

```ts
export async function applyFleetConfigPatch(...) {
  const first = await provider.configGet({});
  try {
    await provider.configPatch({ ...payload, baseHash: resolveHash(first) });
  } catch (err) {
    if (!isStaleHashError(err)) throw err;
    const second = await provider.configGet({});
    await provider.configPatch({ ...payload, baseHash: resolveHash(second) });
  }
}
```

**Step 2: Wire the new action into the executor**

- add a `case "fleet.config_patch"` branch
- keep raw `config.patch` dispatch unchanged
- do not require control-plane download dependencies for this path

**Step 3: Run focused tests to verify GREEN**

Run:

```bash
pnpm test -- tests/sidecar/executor.test.ts tests/gate/evaluate.test.ts
```

Expected: PASS.

**Step 4: Commit**

```bash
git add src/sidecar/config-patch.ts src/sidecar/executor.ts src/sidecar/providers/types.ts tests/sidecar/executor.test.ts tests/gate/evaluate.test.ts
git commit -m "feat(sidecar): add fleet config patch action"
```

### Task 3: Expose the new action in the UI

**Files:**
- Modify: `ui/src/components/TaskModal.tsx`
- Modify: `ui/src/pages/Campaigns.tsx`
- Modify: `ui/src/pages/Memory.tsx`
- Modify: `tests/ui/task-modal.test.tsx`
- Modify: `tests/ui/campaigns-page.test.tsx`
- Create: `tests/ui/memory-page.test.tsx`

**Step 1: Write the failing UI tests**

Add coverage for:
- Task modal shows `fleet.config_patch` and renders fields for `raw`, `note`, `sessionKey`, `restartDelayMs`
- Campaign action guidance includes a `fleet.config_patch` example and explains that `baseHash` is auto-resolved
- Memory page Persona mode creates a task with `action: "fleet.config_patch"` and does not require a base-hash input

Suggested Memory page assertion:

```ts
expect(createTaskBody).toMatchObject({
  action: "fleet.config_patch",
  payload: {
    raw: "{ \"models\": {} }",
    note: "switch model",
  },
});
```

**Step 2: Run focused UI tests to verify RED**

Run:

```bash
pnpm test -- tests/ui/task-modal.test.tsx tests/ui/campaigns-page.test.tsx tests/ui/memory-page.test.tsx
```

Expected: FAIL because the UI does not expose the new action yet.

**Step 3: Implement the smallest UI changes**

- add `fleet.config_patch` to task action lists
- add action docs/example text in Campaigns
- switch Memory Persona mode from raw `config.patch` submission to `fleet.config_patch`
- remove `Base Hash` from the Memory Persona form
- keep raw `config.patch` visible in Campaigns as the expert/manual option

**Step 4: Re-run focused UI tests**

Run:

```bash
pnpm test -- tests/ui/task-modal.test.tsx tests/ui/campaigns-page.test.tsx tests/ui/memory-page.test.tsx
```

Expected: PASS.

**Step 5: Commit**

```bash
git add ui/src/components/TaskModal.tsx ui/src/pages/Campaigns.tsx ui/src/pages/Memory.tsx tests/ui/task-modal.test.tsx tests/ui/campaigns-page.test.tsx tests/ui/memory-page.test.tsx
git commit -m "feat(ui): expose fleet config patch workflows"
```

### Task 4: Refresh operator docs for the new default path

**Files:**
- Modify: `docs/campaign-manual.md`
- Modify: `docs/usage-v0.1.md`
- Modify: `docs/api.md`
- Modify: `docs/cli.md`

**Step 1: Add the missing operator guidance**

Document:
- `fleet.config_patch` payload shape
- that Fleet auto-runs `config.get` per instance
- that `baseHash` is not operator input for this action
- that raw `config.patch` still exists for expert/manual usage
- a concrete example for model updates such as `zai/glm-5-turbo`

**Step 2: Verify doc examples against real OpenClaw merge-patch semantics**

Reference:
- `/home/ldx/codex/agent-swarm/openclaw/src/config/merge-patch.ts`
- `/home/ldx/codex/agent-swarm/openclaw/docs/zh-CN/gateway/configuration.md`

**Step 3: Commit**

```bash
git add docs/campaign-manual.md docs/usage-v0.1.md docs/api.md docs/cli.md
git commit -m "docs: document fleet config patch action"
```

### Task 5: Run full verification and prep the branch

**Files:**
- No code changes unless verification finds a real issue

**Step 1: Run the relevant test suite**

```bash
pnpm test -- tests/sidecar/executor.test.ts tests/gate/evaluate.test.ts tests/ui/task-modal.test.tsx tests/ui/campaigns-page.test.tsx tests/ui/memory-page.test.tsx
pnpm test
```

Expected: PASS.

**Step 2: Run build verification**

```bash
pnpm build
pnpm ui:build
```

Expected: PASS.

**Step 3: Inspect git state**

```bash
git status --short
git log --oneline --decorate -n 5
```

**Step 4: Commit any final verification-only adjustments**

```bash
git add -A
git commit -m "chore: finalize fleet config patch verification"
```

Only if verification forced a real code/doc fix.
