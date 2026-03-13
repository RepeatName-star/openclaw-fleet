/** @vitest-environment jsdom */
import React from "react";
import { render, fireEvent } from "@testing-library/react";
import TaskModal from "../../ui/src/components/TaskModal.js";

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
});
