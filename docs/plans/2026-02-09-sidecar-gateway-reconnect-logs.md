# Sidecar Gateway Reconnect + Error Detail Logging Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Auto-reconnect the sidecar gateway client after gateway restarts and log raw gateway error details in sidecar logs.

**Architecture:** The gateway client will manage a reconnectable WebSocket, resetting readiness on close and retrying connection at a fixed interval unless the close indicates an auth failure. Scheduler logging will include the raw error string returned from gateway responses.

**Tech Stack:** TypeScript, Vitest, ws

### Task 1: Add gateway-client reconnect + raw error tests

**Files:**
- Modify: `tests/sidecar/gateway-client.test.ts`

**Step 1: Write the failing test for raw error payload propagation**

```ts
test("gateway client rejects with raw error payload", async () => {
  const ws = new FakeWebSocket();
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    wsFactory: () => ws as any,
  });

  ws.emit("open");
  emitChallenge(ws);
  respondToLastRequest(ws, true);

  const pending = client.request("health");
  const last = ws.sent[ws.sent.length - 1];
  const frame = JSON.parse(last);
  ws.emit(
    "message",
    Buffer.from(
      JSON.stringify({
        type: "res",
        id: frame.id,
        ok: false,
        error: { message: "nope", code: "E_TEST", detail: { hint: "x" } },
      }),
    ),
  );

  await expect(pending).rejects.toThrow(
    /\{"message":"nope","code":"E_TEST","detail":\{"hint":"x"\}\}/,
  );
  client.close();
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/sidecar/gateway-client.test.ts`
Expected: FAIL because error message is simplified to `message` only.

**Step 3: Write the failing reconnect test (reconnects after close)**

```ts
test("gateway client reconnects after close", async () => {
  vi.useFakeTimers();
  const sockets: FakeWebSocket[] = [];
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    reconnectDelayMs: 10,
    wsFactory: () => {
      const ws = new FakeWebSocket();
      sockets.push(ws);
      return ws as any;
    },
  });

  sockets[0].emit("open");
  emitChallenge(sockets[0]);
  respondToLastRequest(sockets[0], true);

  sockets[0].close(1012, "service restart");
  await vi.advanceTimersByTimeAsync(10);

  expect(sockets.length).toBe(2);
  sockets[1].emit("open");
  emitChallenge(sockets[1]);
  respondToLastRequest(sockets[1], true);

  const pending = client.request("health");
  const last = sockets[1].sent[sockets[1].sent.length - 1];
  expect(JSON.parse(last).method).toBe("health");
  await expect(pending).resolves.toBeTruthy();

  vi.useRealTimers();
  client.close();
});
```

**Step 4: Run test to verify it fails**

Run: `pnpm test tests/sidecar/gateway-client.test.ts`
Expected: FAIL because reconnect is not implemented.

**Step 5: Write the failing test for auth-failure no reconnect**

```ts
test("gateway client stops reconnecting on auth failure", async () => {
  vi.useFakeTimers();
  const sockets: FakeWebSocket[] = [];
  const client = createGatewayClient({
    url: "ws://test",
    token: "t",
    reconnectDelayMs: 10,
    wsFactory: () => {
      const ws = new FakeWebSocket();
      sockets.push(ws);
      return ws as any;
    },
  });

  sockets[0].emit("open");
  emitChallenge(sockets[0]);
  respondToLastRequest(sockets[0], true);
  sockets[0].close(1008, "unauthorized: gateway token mismatch");

  await vi.advanceTimersByTimeAsync(50);
  expect(sockets.length).toBe(1);

  vi.useRealTimers();
  client.close();
});
```

**Step 6: Run test to verify it fails**

Run: `pnpm test tests/sidecar/gateway-client.test.ts`
Expected: FAIL because reconnect suppression is not implemented.

**Step 7: Commit**

```bash
git add tests/sidecar/gateway-client.test.ts
git commit -m "test: cover gateway reconnect and raw error propagation"
```

### Task 2: Implement gateway reconnect + raw error propagation

**Files:**
- Modify: `src/sidecar/gateway-client.ts`

**Step 1: Implement minimal code to pass raw error test**

```ts
const rawError = parsed.error;
const errorMessage =
  typeof rawError === "string"
    ? rawError
    : rawError
      ? JSON.stringify(rawError)
      : "gateway error";
handler.reject(new Error(errorMessage));
```

**Step 2: Implement reconnect loop**

- Track `currentWs` and replace on reconnect.
- Reset `ready` on each new connection.
- On `close`, reject pending and schedule reconnect after `reconnectDelayMs`.
- If `close` indicates auth failure (code 1008 + reason contains `unauthorized` or `token mismatch`), stop reconnect and surface error.

**Step 3: Run tests**

Run: `pnpm test tests/sidecar/gateway-client.test.ts`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/sidecar/gateway-client.ts
git commit -m "fix: reconnect gateway client and keep raw errors"
```

### Task 3: Log task ack errors with raw error detail

**Files:**
- Create: `tests/sidecar/scheduler.test.ts`
- Modify: `src/sidecar/scheduler.ts`

**Step 1: Write the failing test**

```ts
import { expect, test, vi } from "vitest";

const logInfo = vi.fn();
const logWarn = vi.fn();
const logError = vi.fn();

vi.mock("../../src/sidecar/log.js", () => ({
  logInfo,
  logWarn,
  logError,
}));

test("scheduler logs error detail on task ack", async () => {
  const { createScheduler } = await import("../../src/sidecar/scheduler.js");

  const controlPlane = {
    heartbeat: vi.fn().mockResolvedValue(undefined),
    pullTasks: vi.fn().mockResolvedValue([
      { id: "t1", action: "skills.update", payload: {} },
    ]),
    ackTask: vi.fn().mockResolvedValue(undefined),
  };

  const executor = {
    run: vi.fn().mockResolvedValue({
      processed: 0,
      skipped: 0,
      failed: 1,
      errors: { t1: '{"message":"nope","code":"E_TEST"}' },
    }),
  };

  const scheduler = createScheduler({
    controlPlane,
    executor: executor as any,
    deviceToken: "token",
    pollIntervalMs: 1000,
    concurrency: 1,
  });

  await scheduler.runOnce();

  expect(logInfo).toHaveBeenCalledWith("task ack", {
    id: "t1",
    status: "error",
    error: '{"message":"nope","code":"E_TEST"}',
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm test tests/sidecar/scheduler.test.ts`
Expected: FAIL because `task ack` log omits error.

**Step 3: Implement minimal logging change**

```ts
const ackMeta = status === "error" ? { id: task.id, status, error: errorMessage } : { id: task.id, status };
logInfo("task ack", ackMeta);
```

**Step 4: Run test to verify it passes**

Run: `pnpm test tests/sidecar/scheduler.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add tests/sidecar/scheduler.test.ts src/sidecar/scheduler.ts
git commit -m "test: log task ack error details"
```

### Task 4: Full test run

**Files:**
- None

**Step 1: Run full test suite**

Run: `pnpm test`
Expected: PASS all tests.

**Step 2: Commit (if needed)**

```bash
git status
```
Expected: clean.
