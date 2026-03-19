/** @vitest-environment jsdom */
import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react";
import TaskModal from "../../ui/src/components/TaskModal.js";
import { vi } from "vitest";

const baseInstance = {
  id: "i-1",
  name: "Instance-1",
  updated_at: new Date().toISOString(),
  online: true,
};

test("task modal preserves input when instances refresh while open", () => {
  const { getByLabelText, rerender } = render(
    <TaskModal open={true} onClose={() => {}} instances={[baseInstance]} />,
  );

  const textarea = getByLabelText("Message") as HTMLTextAreaElement;
  fireEvent.change(textarea, { target: { value: "hello" } });
  expect(textarea.value).toBe("hello");

  rerender(
    <TaskModal
      open={true}
      onClose={() => {}}
      instances={[{ ...baseInstance, name: "Instance-1b" }]}
    />,
  );

  const updated = getByLabelText("Message") as HTMLTextAreaElement;
  expect(updated.value).toBe("hello");
});

test("task modal supports probe and bundle install actions", () => {
  const { getByLabelText, getByText } = render(
    <TaskModal open={true} onClose={() => {}} instances={[baseInstance]} />,
  );

  const actionSelect = getByLabelText("Action") as HTMLSelectElement;

  fireEvent.change(actionSelect, { target: { value: "fleet.gateway.probe" } });
  expect(getByText("无需额外参数。")).toBeTruthy();

  fireEvent.change(actionSelect, { target: { value: "fleet.skill_bundle.install" } });
  expect(getByLabelText("Bundle ID")).toBeTruthy();
  expect(getByLabelText("Bundle Name")).toBeTruthy();
  expect(getByLabelText("Bundle SHA256")).toBeTruthy();

  fireEvent.change(actionSelect, { target: { value: "fleet.config_patch" } });
  expect(getByLabelText("Patch Raw")).toBeTruthy();
  expect(getByLabelText("Note")).toBeTruthy();
  expect(getByLabelText("Session Key")).toBeTruthy();
  expect(getByLabelText("Restart Delay (ms)")).toBeTruthy();
  expect(getByText(/无需手动填写 baseHash/i)).toBeTruthy();
});

test("task modal submits optional task name", async () => {
  const requests: Array<{ url: string; body: any }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/v1/tasks" && init?.method === "POST") {
        const body = JSON.parse(String(init.body ?? "{}"));
        requests.push({ url, body });
        return new Response(JSON.stringify({ id: "task-1" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }) as any;
      }
      throw new Error(`unexpected request ${init?.method ?? "GET"} ${url}`);
    }),
  );

  const onCreated = vi.fn();
  const onClose = vi.fn();
  const { getByLabelText, getByRole } = render(
    <TaskModal
      open={true}
      onClose={onClose}
      onCreated={onCreated}
      instances={[baseInstance]}
    />,
  );

  fireEvent.change(getByLabelText("任务名称"), { target: { value: "切换模型" } });
  fireEvent.change(getByLabelText("Message"), { target: { value: "hello" } });
  fireEvent.click(getByRole("button", { name: "创建任务" }));

  await waitFor(() =>
    expect(requests[0]?.body).toMatchObject({
      task_name: "切换模型",
      action: "agent.run",
      target_id: "i-1",
    }),
  );
  expect(onCreated).toHaveBeenCalledWith("task-1");
  expect(onClose).toHaveBeenCalled();
});
