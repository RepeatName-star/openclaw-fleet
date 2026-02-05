import type { createExecutor } from "./executor.js";

type ControlPlaneClient = {
  heartbeat: (deviceToken: string) => Promise<void>;
  pullTasks: (deviceToken: string, limit: number) => Promise<any[]>;
  ackTask: (deviceToken: string, taskId: string, status: "ok" | "error", error?: string) => Promise<void>;
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
    await options.controlPlane.heartbeat(options.deviceToken);
    const tasks = await options.controlPlane.pullTasks(options.deviceToken, options.concurrency * 2);
    if (tasks.length === 0) {
      return;
    }
    await runWithLimit(tasks, options.concurrency, async (task) => {
      const result = await options.executor.run([task]);
      if (result.failed > 0) {
        await options.controlPlane.ackTask(options.deviceToken, task.id, "error", "execution failed");
      } else if (result.skipped > 0) {
        await options.controlPlane.ackTask(options.deviceToken, task.id, "ok");
      } else {
        await options.controlPlane.ackTask(options.deviceToken, task.id, "ok");
      }
    });
  }

  function start() {
    if (timer) {
      return;
    }
    timer = setInterval(() => {
      runOnce().catch(() => {});
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
