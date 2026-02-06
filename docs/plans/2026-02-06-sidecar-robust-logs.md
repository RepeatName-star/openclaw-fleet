# Sidecar Robustness + Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make sidecar gateway requests resilient (no silent hangs) and ensure runtime logs are visible in stdout and a persistent log file.

**Architecture:** Add deterministic request timeouts and close/error handling in the gateway client, propagate per-task errors from executor to scheduler acks, and introduce a centralized logger that writes to stdout/stderr plus a file path controlled by `OPENCLAW_SIDECAR_LOG_PATH` (defaulting to `~/.openclaw-fleet/sidecar.log`).

**Tech Stack:** TypeScript (Node.js), Vitest, existing sidecar modules.

### Task 1: Add gateway-client failure handling tests

**Files:**
- Modify: `tests/sidecar/gateway-client.test.ts`

**Step 1: Write the failing test**

```ts
// add to tests/sidecar/gateway-client.test.ts
class FakeWebSocket { /* ... */ }

test("gateway client rejects request on timeout", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    requestTimeoutMs: 20,
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  await expect(client.request("health")).rejects.toThrow(/timeout/i);
  client.close();
});

test("gateway client rejects pending requests on close", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    requestTimeoutMs: 1000,
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  const pending = client.request("health");
  ws.close(1008, "bye");

  await expect(pending).rejects.toThrow(/gateway closed/i);
  client.close();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/sidecar/gateway-client.test.ts`

Expected: FAIL with a timeout or missing close rejection behavior.

**Step 3: Write minimal implementation**

- Update `src/sidecar/gateway-client.ts` to:
  - Register pending requests immediately, but only send after `ready` resolves.
  - On WS close/error, reject pending requests with a “gateway closed” error.
  - Ensure timeout timers are cleared when a response or close occurs.
  - When `wsFactory` is supplied, do not require `ws` module.

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/sidecar/gateway-client.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/sidecar/gateway-client.test.ts src/sidecar/gateway-client.ts
git commit -m "test: cover gateway close + timeout handling"
```

### Task 2: Add executor error detail tests

**Files:**
- Modify: `tests/sidecar/executor.test.ts`

**Step 1: Write the failing test**

```ts
// add to tests/sidecar/executor.test.ts

test("executor records failure details", async () => {
  const state = { executed: {} } as any;
  const provider = {
    sessionReset: async () => {
      throw new Error("boom");
    },
  } as any;
  const exec = createExecutor({ provider, state });
  const res = await exec.run([{ id: "t2", action: "session.reset", payload: {} }]);
  expect(res.failed).toBe(1);
  expect(res.errors?.t2).toMatch(/boom/);
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- tests/sidecar/executor.test.ts`

Expected: FAIL because `errors` is undefined.

**Step 3: Write minimal implementation**

- Update `src/sidecar/executor.ts` to:
  - Add `errors: Record<string, string>` to the result.
  - Capture error messages for failed tasks.
  - Emit log lines (info/warn/error) for start/skip/fail (using the sidecar logger).

**Step 4: Run test to verify it passes**

Run: `pnpm test -- tests/sidecar/executor.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add tests/sidecar/executor.test.ts src/sidecar/executor.ts
git commit -m "feat: record executor failure details"
```

### Task 3: Add sidecar logger with file output

**Files:**
- Create: `src/sidecar/log.ts`
- Modify: `src/sidecar/cli.ts`
- Modify: `src/sidecar/scheduler.ts`
- Modify: `src/sidecar/gateway-client.ts`

**Step 1: Write the failing test**

If no logging tests exist, skip unit tests and validate via manual log output after implementation.

**Step 2: Implement logger**

- Create `src/sidecar/log.ts` that writes to stdout/stderr and appends to a log file.
- Default file path: `${HOME}/.openclaw-fleet/sidecar.log`.
- Override via `OPENCLAW_SIDECAR_LOG_PATH` (empty string disables file output).

**Step 3: Wire logs**

- `src/sidecar/scheduler.ts`: log heartbeat/pull counts, per-task ack, and errors.
- `src/sidecar/gateway-client.ts`: log close/error events (warn/error).
- `src/sidecar/cli.ts`: log startup config (poll interval, concurrency, control-plane URL).

**Step 4: Run targeted tests**

Run: `pnpm test -- tests/sidecar/gateway-client.test.ts tests/sidecar/executor.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/sidecar/log.ts src/sidecar/cli.ts src/sidecar/scheduler.ts src/sidecar/gateway-client.ts
git commit -m "feat: add sidecar logging and file output"
```

### Task 4: Scheduler ack error propagation

**Files:**
- Modify: `src/sidecar/scheduler.ts`

**Step 1: Write the failing test**

If scheduler is untested, skip test and validate with manual control-plane run.

**Step 2: Implement**

- Use executor result `errors[task.id]` when acknowledging errors.
- If no error string exists, fallback to "execution failed".

**Step 3: Run targeted tests**

Run: `pnpm test -- tests/sidecar/executor.test.ts`

Expected: PASS.

**Step 4: Commit**

```bash
git add src/sidecar/scheduler.ts
git commit -m "feat: propagate per-task error details to control plane"
```

### Task 5: Final verification

**Files:**
- (None)

**Step 1: Run full test suite**

Run: `pnpm test`

Expected: PASS.

**Step 2: Manual sanity check**

- Run sidecar and trigger a failing task.
- Confirm stdout/stderr logs appear and `~/.openclaw-fleet/sidecar.log` is written.
- Confirm control-plane task error text includes the thrown message.

**Step 3: Commit**

If any manual-only changes were made, commit them with a descriptive message.
