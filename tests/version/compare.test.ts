import { compareVersions } from "../../src/version/compare.js";

test("compareVersions compares CalVer YYYY.M.D", () => {
  expect(compareVersions("2026.2.26", "2026.2.25")).toBeGreaterThan(0);
  expect(compareVersions("2026.2.26", "2026.2.26")).toBe(0);
  expect(compareVersions("2026.2.2", "2026.2.26")).toBeLessThan(0);
});

test("compareVersions compares SemVer", () => {
  expect(compareVersions("1.2.3", "1.2.2")).toBeGreaterThan(0);
  expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  expect(compareVersions("1.2.3", "2.0.0")).toBeLessThan(0);
});

test("compareVersions rejects unparseable versions", () => {
  expect(() => compareVersions("nope", "1.0.0")).toThrow(/unparseable/i);
});

