import { loadConfig } from "../src/config";

test("loadConfig requires DATABASE_URL and REDIS_URL", () => {
  expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow();
});
