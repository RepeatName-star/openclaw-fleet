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
