import fs from "node:fs";
import { createStateStore } from "../../src/sidecar/state-store.js";

const tmp = "/tmp/sidecar-state-test.json";

afterEach(() => {
  if (fs.existsSync(tmp)) {
    fs.unlinkSync(tmp);
  }
});

test("state store persists device token and executed tasks", async () => {
  const store = createStateStore(tmp);
  await store.save({ deviceToken: "t1", executed: { "task-1": true } });
  const loaded = await store.load();
  expect(loaded.deviceToken).toBe("t1");
  expect(loaded.executed["task-1"]).toBe(true);
});
