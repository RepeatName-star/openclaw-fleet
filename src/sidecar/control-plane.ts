type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

type ControlPlaneClientOptions = {
  baseUrl: string;
  fetch?: FetchLike;
};

export function createControlPlaneClient(options: ControlPlaneClientOptions) {
  const fetcher = options.fetch ?? fetch;
  const baseUrl = options.baseUrl.replace(/\/$/, "");

  async function enroll(enrollmentToken: string, instanceName: string): Promise<string> {
    const res = await fetcher(`${baseUrl}/v1/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enrollment_token: enrollmentToken,
        instance_name: instanceName,
      }),
    });
    if (!res.ok) {
      throw new Error("enroll failed");
    }
    const data = (await res.json()) as { device_token?: string };
    if (!data.device_token) {
      throw new Error("missing device token");
    }
    return data.device_token;
  }

  async function heartbeat(deviceToken: string): Promise<void> {
    const res = await fetcher(`${baseUrl}/v1/heartbeat`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${deviceToken}`,
      },
    });
    if (!res.ok) {
      throw new Error("heartbeat failed");
    }
  }

  async function pullTasks(deviceToken: string, limit = 10): Promise<unknown[]> {
    const res = await fetcher(`${baseUrl}/v1/tasks/pull`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify({ limit }),
    });
    if (!res.ok) {
      throw new Error("pull tasks failed");
    }
    const data = (await res.json()) as { tasks?: unknown[] };
    return data.tasks ?? [];
  }

  async function ackTask(
    deviceToken: string,
    taskId: string,
    status: "ok" | "error",
    error?: string,
    result?: unknown,
  ): Promise<void> {
    const res = await fetcher(`${baseUrl}/v1/tasks/ack`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${deviceToken}`,
      },
      body: JSON.stringify({ task_id: taskId, status, error, result }),
    });
    if (!res.ok) {
      throw new Error("ack failed");
    }
  }

  return {
    enroll,
    heartbeat,
    pullTasks,
    ackTask,
  };
}
