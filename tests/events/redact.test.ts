import { redactValue } from "../../src/events/redact.js";

test("redactValue hashes sensitive strings and keeps prefix(4)", () => {
  const r = redactValue("supersecret", { mode: "sensitive" });
  expect(r).toMatch(/^supe\[sha256:[0-9a-f]{64}\]$/);
});

test("redactValue walks objects and redacts known sensitive paths", () => {
  const input = {
    action: "agent.run",
    payload: { message: "hello", token: "t-123" },
  };
  const out = redactValue(input, {
    mode: "event",
    sensitivePaths: [
      ["payload", "message"], // agent.run.message
      ["payload", "token"],
    ],
  }) as any;
  expect(out.payload.message).toMatch(/\[sha256:/);
  expect(out.payload.token).toMatch(/\[sha256:/);
});
