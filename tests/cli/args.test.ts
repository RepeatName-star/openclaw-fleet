import { parseArgs } from "../../src/cli/index.js";

test("parseArgs parses baseUrl and command", () => {
  const parsed = parseArgs(["--base-url", "http://x", "campaign", "list"]);
  expect(parsed.baseUrl).toBe("http://x");
  expect(parsed.command).toEqual(["campaign", "list"]);
});

