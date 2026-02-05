# OpenClaw Fleet Sidecar Implementation Plan

**Goal:** Build a Node/TypeScript sidecar that polls the control plane for tasks and executes them against OpenClaw Gateway or a generic HTTP provider with local JSON state and idempotency.

**Architecture:** A CLI entrypoint loads config (file + env), initializes a JSON state store, instantiates a provider adapter (OpenClaw Gateway via WS or generic HTTP), and runs a scheduler that performs heartbeat + task pull + concurrent execution + ack. Actions are mapped through a Task Executor and provider-specific adapters.

**Tech Stack:** Node.js, TypeScript, Zod, Vitest, ws (for Gateway), native fetch (Node 18+).

---

### Task 1: Sidecar config + CLI scaffold

**Files:**
- Create: `src/sidecar/config.ts`
- Create: `src/sidecar/cli.ts`
- Modify: `package.json`
- Test: `tests/sidecar/config.test.ts`

**Step 1: Write the failing test**
```ts
import { loadSidecarConfig } from "../../src/sidecar/config";

test("loadSidecarConfig requires controlPlaneUrl and enrollmentToken", () => {
  expect(() => loadSidecarConfig({} as NodeJS.ProcessEnv)).toThrow();
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/config.test.ts`
Expected: FAIL with module not found / loadSidecarConfig missing.

**Step 3: Write minimal implementation**
- `src/sidecar/config.ts`: Zod schema with defaults:
  - `CONTROL_PLANE_URL` (required)
  - `ENROLLMENT_TOKEN` (required, unless DEVICE_TOKEN set)
  - `DEVICE_TOKEN` (optional)
  - `PROVIDER` (default "openclaw")
  - `POLL_INTERVAL_MS` (default 5000)
  - `CONCURRENCY` (default 2)
  - `STATE_PATH` (default `~/.openclaw-fleet/sidecar-state.json`)
  - `OPENCLAW_GATEWAY_URL` (default `http://127.0.0.1:18793`)
  - `OPENCLAW_GATEWAY_TOKEN` (optional)
- `src/sidecar/cli.ts`: parse env, start main loop (placeholder)
- `package.json`: add `sidecar:dev` script (`node --loader ts-node/esm src/sidecar/cli.ts`)

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/config.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/config.ts src/sidecar/cli.ts tests/sidecar/config.test.ts package.json
git commit -m "feat(sidecar): add config loader and cli scaffold"
```

---

### Task 2: JSON state store (atomic writes)

**Files:**
- Create: `src/sidecar/state-store.ts`
- Test: `tests/sidecar/state-store.test.ts`

**Step 1: Write the failing test**
```ts
import { createStateStore } from "../../src/sidecar/state-store";

const tmp = "/tmp/sidecar-state-test.json";

test("state store persists device token and executed tasks", async () => {
  const store = createStateStore(tmp);
  await store.save({ deviceToken: "t1", executed: { "task-1": true } });
  const loaded = await store.load();
  expect(loaded.deviceToken).toBe("t1");
  expect(loaded.executed["task-1"]).toBe(true);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/state-store.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `createStateStore(path)` with:
  - `load()` (returns default if missing)
  - `save(state)` using temp file + rename for atomicity
  - `markExecuted(taskId)` helper

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/state-store.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/state-store.ts tests/sidecar/state-store.test.ts
git commit -m "feat(sidecar): add json state store"
```

---

### Task 3: Control plane client (enroll/heartbeat/pull/ack)

**Files:**
- Create: `src/sidecar/control-plane.ts`
- Test: `tests/sidecar/control-plane.test.ts`

**Step 1: Write the failing test**
```ts
import { createControlPlaneClient } from "../../src/sidecar/control-plane";

test("enroll returns device token", async () => {
  const fetchMock = async () => ({ ok: true, json: async () => ({ device_token: "d1" }) });
  const client = createControlPlaneClient({ baseUrl: "http://cp", fetch: fetchMock as any });
  const token = await client.enroll("e1", "host-1");
  expect(token).toBe("d1");
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/control-plane.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `createControlPlaneClient({ baseUrl, fetch })` with methods:
  - `enroll(enrollmentToken, instanceName)` -> device_token
  - `heartbeat(deviceToken)`
  - `pullTasks(deviceToken, limit)`
  - `ackTask(deviceToken, taskId, status, error?)`

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/control-plane.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/control-plane.ts tests/sidecar/control-plane.test.ts
git commit -m "feat(sidecar): add control plane client"
```

---

### Task 4: Provider interface + Generic HTTP provider

**Files:**
- Create: `src/sidecar/providers/types.ts`
- Create: `src/sidecar/providers/generic-http.ts`
- Test: `tests/sidecar/providers/generic-http.test.ts`

**Step 1: Write the failing test**
```ts
import { createGenericHttpProvider } from "../../../src/sidecar/providers/generic-http";

test("generic provider calls /skills endpoint", async () => {
  let called = false;
  const fetchMock = async (url: string) => {
    if (url.endsWith("/skills")) called = true;
    return { ok: true, json: async () => ({ ok: true }) } as any;
  };
  const provider = createGenericHttpProvider({ baseUrl: "http://agent", fetch: fetchMock as any });
  await provider.skillsUpdate({ skillKey: "x", enabled: true });
  expect(called).toBe(true);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/providers/generic-http.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- Provider interface with methods: `configPatch`, `skillsInstall`, `skillsUpdate`, `memoryReplace`, `sessionReset`, `agentRun`.
- Generic provider calls HTTP endpoints under baseUrl.

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/providers/generic-http.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/providers/types.ts src/sidecar/providers/generic-http.ts tests/sidecar/providers/generic-http.test.ts
git commit -m "feat(sidecar): add generic http provider"
```

---

### Task 5: Gateway client + OpenClaw provider mapping

**Files:**
- Create: `src/sidecar/gateway-client.ts`
- Create: `src/sidecar/providers/openclaw.ts`
- Test: `tests/sidecar/providers/openclaw.test.ts`

**Step 1: Write the failing test**
```ts
import { createOpenClawProvider } from "../../../src/sidecar/providers/openclaw";

test("openclaw provider maps memory replace", async () => {
  const calls: Array<{ method: string }> = [];
  const gateway = { request: async (method: string) => { calls.push({ method }); return {}; } } as any;
  const provider = createOpenClawProvider({ gateway });
  await provider.memoryReplace({ agentId: "main", content: "x" });
  expect(calls.map(c => c.method)).toEqual(["agents.files.set", "sessions.reset"]);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/providers/openclaw.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `gateway-client.ts`: WebSocket client implementing `request(method, params)`.
- `openclaw.ts`: map actions per API mapping doc (config/skills/memory/session).
- In test, inject fake gateway client (no WS needed).

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/providers/openclaw.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/gateway-client.ts src/sidecar/providers/openclaw.ts tests/sidecar/providers/openclaw.test.ts
git commit -m "feat(sidecar): add openclaw provider"
```

---

### Task 6: Task executor + concurrency scheduler

**Files:**
- Create: `src/sidecar/executor.ts`
- Create: `src/sidecar/scheduler.ts`
- Test: `tests/sidecar/executor.test.ts`

**Step 1: Write the failing test**
```ts
import { createExecutor } from "../../src/sidecar/executor";

test("executor skips already executed tasks", async () => {
  const state = { executed: { t1: true } } as any;
  const provider = { skillsUpdate: async () => {} } as any;
  const exec = createExecutor({ provider, state });
  const res = await exec.run([{ id: "t1", action: "skills.update", payload: {} }]);
  expect(res.skipped).toBe(1);
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/executor.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `executor.ts`: map actions to provider methods and record idempotency.
- `scheduler.ts`: run heartbeats + pull tasks + execute with concurrency limit.

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/executor.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/executor.ts src/sidecar/scheduler.ts tests/sidecar/executor.test.ts
git commit -m "feat(sidecar): add executor and scheduler"
```

---

### Task 7: Wire CLI to runtime

**Files:**
- Modify: `src/sidecar/cli.ts`
- Test: `tests/sidecar/cli.test.ts`

**Step 1: Write the failing test**
```ts
import { startSidecar } from "../../src/sidecar/cli";

test("startSidecar throws when missing config", async () => {
  await expect(startSidecar({} as any)).rejects.toThrow();
});
```

**Step 2: Run test to verify it fails**
Run: `pnpm test -- tests/sidecar/cli.test.ts`
Expected: FAIL.

**Step 3: Write minimal implementation**
- `cli.ts` exports `startSidecar` for tests.
- `startSidecar` wires config, state, provider, control-plane client, scheduler.

**Step 4: Run test to verify it passes**
Run: `pnpm test -- tests/sidecar/cli.test.ts`
Expected: PASS.

**Step 5: Commit**
```bash
git add src/sidecar/cli.ts tests/sidecar/cli.test.ts
git commit -m "feat(sidecar): wire cli runtime"
```

---

### Task 8: Docs + usage

**Files:**
- Modify: `README.md`
- Create: `docs/sidecar.md`

**Step 1: Write docs**
- `docs/sidecar.md`: config file, env vars, enrollment flow, provider modes.
- `README.md`: add sidecar quickstart.

**Step 2: Commit**
```bash
git add README.md docs/sidecar.md
git commit -m "docs: add sidecar usage"
```

---

## Verification Checklist
- `pnpm test` (all tests pass)
- `pnpm sidecar:dev` runs (manual smoke)
