import { validateK8sLabelKey, validateK8sLabelValue } from "./k8s-labels.js";

export type LabelSelectorRequirement =
  | { op: "exists"; key: string }
  | { op: "doesNotExist"; key: string }
  | { op: "eq"; key: string; value: string }
  | { op: "neq"; key: string; value: string }
  | { op: "in"; key: string; values: string[] }
  | { op: "notin"; key: string; values: string[] };

export type LabelSelector = {
  requirements: LabelSelectorRequirement[];
};

export type ParseLabelSelectorResult =
  | { selector: LabelSelector; error?: undefined }
  | { selector?: undefined; error: string };

type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function splitTopLevelCommas(input: string): ParseResult<string[]> {
  const parts = [] as string[];
  let buf = "";
  let depth = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "(") {
      depth++;
      buf += ch;
      continue;
    }
    if (ch === ")") {
      depth--;
      if (depth < 0) {
        return { ok: false, error: "unmatched ')'" };
      }
      buf += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      const part = buf.trim();
      if (part.length > 0) {
        parts.push(part);
      }
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (depth !== 0) {
    return { ok: false, error: "unmatched '('" };
  }
  const last = buf.trim();
  if (last.length > 0) {
    parts.push(last);
  }
  return { ok: true, value: parts };
}

function parseKey(key: string): ParseResult<string> {
  const trimmed = key.trim();
  const res = validateK8sLabelKey(trimmed);
  if (!res.ok) {
    return { ok: false, error: `invalid label key: ${trimmed}` };
  }
  return { ok: true, value: trimmed };
}

function parseValue(value: string): ParseResult<string> {
  const trimmed = value.trim();
  const res = validateK8sLabelValue(trimmed);
  if (!res.ok) {
    return { ok: false, error: `invalid label value: ${trimmed}` };
  }
  return { ok: true, value: trimmed };
}

function parseValues(values: string): ParseResult<string[]> {
  const parts = values
    .split(",")
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
  if (parts.length === 0) {
    return { ok: false, error: "empty values list" };
  }
  for (const v of parts) {
    const res = validateK8sLabelValue(v);
    if (!res.ok) {
      return { ok: false, error: `invalid label value: ${v}` };
    }
  }
  return { ok: true, value: parts };
}

export function parseLabelSelector(input: string): ParseLabelSelectorResult {
  const trimmed = (input ?? "").trim();
  if (trimmed.length === 0) {
    return { selector: { requirements: [] } };
  }

  const split = splitTopLevelCommas(trimmed);
  if (!split.ok) {
    return { error: split.error };
  }

  const requirements = [] as LabelSelectorRequirement[];
  for (const expr of split.value) {
    if (expr.startsWith("!")) {
      const keyRes = parseKey(expr.slice(1));
      if (!keyRes.ok) return { error: keyRes.error };
      requirements.push({ op: "doesNotExist", key: keyRes.value });
      continue;
    }

    const setMatch = expr.match(/^(.+?)\s+(in|notin)\s*\((.*)\)\s*$/i);
    if (setMatch) {
      const [, rawKey, opRaw, rawValues] = setMatch;
      const keyRes = parseKey(rawKey);
      if (!keyRes.ok) return { error: keyRes.error };
      const valuesRes = parseValues(rawValues);
      if (!valuesRes.ok) return { error: valuesRes.error };
      const op = opRaw.toLowerCase() as "in" | "notin";
      requirements.push({ op, key: keyRes.value, values: valuesRes.value });
      continue;
    }

    const notEqIdx = expr.indexOf("!=");
    if (notEqIdx !== -1) {
      const rawKey = expr.slice(0, notEqIdx);
      const rawValue = expr.slice(notEqIdx + 2);
      const keyRes = parseKey(rawKey);
      if (!keyRes.ok) return { error: keyRes.error };
      const valueRes = parseValue(rawValue);
      if (!valueRes.ok) return { error: valueRes.error };
      requirements.push({ op: "neq", key: keyRes.value, value: valueRes.value });
      continue;
    }

    const eqIdx = expr.indexOf("=");
    if (eqIdx !== -1) {
      const rawKey = expr.slice(0, eqIdx);
      const rawValue = expr.slice(eqIdx + 1);
      const keyRes = parseKey(rawKey);
      if (!keyRes.ok) return { error: keyRes.error };
      const valueRes = parseValue(rawValue);
      if (!valueRes.ok) return { error: valueRes.error };
      requirements.push({ op: "eq", key: keyRes.value, value: valueRes.value });
      continue;
    }

    const keyRes = parseKey(expr);
    if (!keyRes.ok) return { error: keyRes.error };
    requirements.push({ op: "exists", key: keyRes.value });
  }

  return { selector: { requirements } };
}

export function matchLabelSelector(selector: LabelSelector, labels: Record<string, string>): boolean {
  for (const req of selector.requirements) {
    const hasKey = Object.prototype.hasOwnProperty.call(labels, req.key);
    const val = hasKey ? labels[req.key] : undefined;
    switch (req.op) {
      case "exists": {
        if (!hasKey) return false;
        break;
      }
      case "doesNotExist": {
        if (hasKey) return false;
        break;
      }
      case "eq": {
        if (!hasKey || val !== req.value) return false;
        break;
      }
      case "neq": {
        // K8s semantics: missing key counts as a match.
        if (hasKey && val === req.value) return false;
        break;
      }
      case "in": {
        if (!hasKey || !req.values.includes(String(val))) return false;
        break;
      }
      case "notin": {
        // K8s semantics: missing key counts as a match.
        if (hasKey && req.values.includes(String(val))) return false;
        break;
      }
      default: {
        const never: never = req;
        return never;
      }
    }
  }
  return true;
}
