import { loadConfig } from "../src/config.js";

test("loadConfig requires DATABASE_URL and REDIS_URL", () => {
  expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow();
});
