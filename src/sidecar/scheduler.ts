import type { createExecutor } from "./executor.js";
import { logError, logInfo, logWarn } from "./log.js";

type ControlPlaneClient = {
  heartbeat: (deviceToken: string) => Promise<void>;
  pullTasks: (deviceToken: string, limit: number) => Promise<any[]>;
  ackTask: (
    deviceToken: string,
    taskId: string,
    status: "ok" | "error",
    error?: string,
    result?: unknown,
  ) => Promise<void>;
};

type Executor = ReturnType<typeof createExecutor>;

type SchedulerOptions = {
  controlPlane: ControlPlaneClient;
  executor: Executor;
  deviceToken: string;
  pollIntervalMs: number;
  concurrency: number;
};

export function createScheduler(options: SchedulerOptions) {
  let timer: NodeJS.Timeout | null = null;

  async function runOnce() {
    try {
      await options.controlPlane.heartbeat(options.deviceToken);
    } catch (err) {
      logError("heartbeat failed", { error: String(err) });
      return;
    }
    let tasks: any[] = [];
    try {
      tasks = await options.controlPlane.pullTasks(options.deviceToken, options.concurrency * 2);
    } catch (err) {
      logError("pull tasks failed", { error: String(err) });
      return;
    }
    if (tasks.length === 0) {
      return;
    }
    logInfo("pulled tasks", { count: tasks.length });
    await runWithLimit(tasks, options.concurrency, async (task) => {
      logInfo("task start", { id: task.id, action: task.action });
      const result = await options.executor.run([task]);
      const status = result.failed > 0 ? "error" : "ok";
      const errorMessage =
        result.failed > 0 ? result.errors?.[task.id] ?? "execution failed" : undefined;
      const taskResult = status === "ok" ? result.results?.[task.id] : undefined;
      if (result.skipped > 0) {
        logWarn("task skipped", { id: task.id, action: task.action });
      }
      try {
        await options.controlPlane.ackTask(
          options.deviceToken,
          task.id,
          status,
          errorMessage,
          taskResult,
        );
        const ackMeta =
          status === "error"
            ? { id: task.id, status, error: errorMessage }
            : { id: task.id, status };
        logInfo("task ack", ackMeta);
      } catch (err) {
        logError("task ack failed", { id: task.id, status, error: String(err) });
      }
    });
  }

  function start() {
    if (timer) {
      return;
    }
    timer = setInterval(() => {
      runOnce().catch((err) => {
        logError("scheduler tick failed", { error: String(err) });
      });
    }, options.pollIntervalMs);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  return { start, stop, runOnce };
}

async function runWithLimit<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  const queue = [...items];
  const running: Promise<void>[] = [];

  const next = async () => {
    const item = queue.shift();
    if (!item) {
      return;
    }
    await worker(item);
    await next();
  };

  for (let i = 0; i < Math.max(1, limit); i += 1) {
    running.push(next());
  }
  await Promise.all(running);
}
