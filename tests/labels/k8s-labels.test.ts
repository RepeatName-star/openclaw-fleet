import { validateK8sLabelKey, validateK8sLabelValue } from "../../src/labels/k8s-labels.js";

test("validateK8sLabelKey accepts common keys", () => {
  expect(validateK8sLabelKey("biz.openclaw.io/team").ok).toBe(true);
  expect(validateK8sLabelKey("openclaw.io/os").ok).toBe(true);
  expect(validateK8sLabelKey("a").ok).toBe(true);
});

test("validateK8sLabelKey rejects invalid keys", () => {
  expect(validateK8sLabelKey("").ok).toBe(false);
  expect(validateK8sLabelKey("a/").ok).toBe(false);
  expect(validateK8sLabelKey("/a").ok).toBe(false);
  expect(validateK8sLabelKey("a/b/c").ok).toBe(false);
});

test("validateK8sLabelValue accepts empty and common values", () => {
  expect(validateK8sLabelValue("").ok).toBe(true);
  expect(validateK8sLabelValue("prod").ok).toBe(true);
  expect(validateK8sLabelValue("a_b.c-d").ok).toBe(true);
});

test("validateK8sLabelValue rejects invalid values", () => {
  expect(validateK8sLabelValue(" ").ok).toBe(false);
  expect(validateK8sLabelValue("a/").ok).toBe(false);
});

