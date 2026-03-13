import { parseLabelSelector, matchLabelSelector } from "../../src/labels/label-selector.js";

test("parseLabelSelector supports equality and existence", () => {
  const parsed = parseLabelSelector("a=b,c");
  expect(parsed.error).toBeUndefined();
  expect(parsed.selector?.requirements.length).toBe(2);
});

test("matchLabelSelector matches basic selectors", () => {
  const parsed = parseLabelSelector("a=b,c");
  expect(matchLabelSelector(parsed.selector!, { a: "b", c: "" })).toBe(true);
  expect(matchLabelSelector(parsed.selector!, { a: "x", c: "" })).toBe(false);
});

test("matchLabelSelector supports in/notin", () => {
  const parsed = parseLabelSelector("a in (b,c),d notin (x)");
  expect(matchLabelSelector(parsed.selector!, { a: "b", d: "y" })).toBe(true);
  expect(matchLabelSelector(parsed.selector!, { a: "z", d: "y" })).toBe(false);
});

