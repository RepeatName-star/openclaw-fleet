export type LabelValidationResult = { ok: true } | { ok: false; error: string };

const MAX_LABEL_KEY_LENGTH = 317; // 253 (prefix) + 1 (/) + 63 (name)
const MAX_LABEL_PREFIX_LENGTH = 253;
const MAX_LABEL_NAME_LENGTH = 63;
const MAX_LABEL_VALUE_LENGTH = 63;

// Kubernetes label name and label value use the same character rules:
// - empty is allowed only for values
// - otherwise: alphanumeric start/end, middle can include [-_.] and alphanumerics.
const labelNameRe = /^[A-Za-z0-9]([A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?$/;
const labelValueRe = /^([A-Za-z0-9]([A-Za-z0-9_.-]{0,61}[A-Za-z0-9])?)?$/;

// Kubernetes label key prefix must be a DNS subdomain (RFC 1123).
const dnsLabelRe = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;

function validateDnsSubdomain(prefix: string): LabelValidationResult {
  if (prefix.length === 0) {
    return { ok: false, error: "empty prefix" };
  }
  if (prefix.length > MAX_LABEL_PREFIX_LENGTH) {
    return { ok: false, error: "prefix too long" };
  }
  const labels = prefix.split(".");
  for (const part of labels) {
    if (part.length === 0) {
      return { ok: false, error: "empty dns label" };
    }
    if (part.length > 63) {
      return { ok: false, error: "dns label too long" };
    }
    if (!dnsLabelRe.test(part)) {
      return { ok: false, error: "invalid dns label" };
    }
  }
  return { ok: true };
}

export function validateK8sLabelKey(key: string): LabelValidationResult {
  if (typeof key !== "string" || key.length === 0) {
    return { ok: false, error: "empty key" };
  }
  if (key.length > MAX_LABEL_KEY_LENGTH) {
    return { ok: false, error: "key too long" };
  }

  const parts = key.split("/");
  if (parts.length > 2) {
    return { ok: false, error: "too many '/'" };
  }

  const [maybePrefix, maybeName] = parts.length === 2 ? parts : [null, parts[0]];
  if (!maybeName || maybeName.length === 0) {
    return { ok: false, error: "missing name" };
  }
  if (maybeName.length > MAX_LABEL_NAME_LENGTH) {
    return { ok: false, error: "name too long" };
  }
  if (!labelNameRe.test(maybeName)) {
    return { ok: false, error: "invalid name" };
  }

  if (parts.length === 2) {
    if (!maybePrefix || maybePrefix.length === 0) {
      return { ok: false, error: "missing prefix" };
    }
    const res = validateDnsSubdomain(maybePrefix);
    if (!res.ok) {
      return res;
    }
  }

  return { ok: true };
}

export function validateK8sLabelValue(value: string): LabelValidationResult {
  if (typeof value !== "string") {
    return { ok: false, error: "invalid value type" };
  }
  if (value.length > MAX_LABEL_VALUE_LENGTH) {
    return { ok: false, error: "value too long" };
  }
  if (!labelValueRe.test(value)) {
    return { ok: false, error: "invalid value" };
  }
  return { ok: true };
}

