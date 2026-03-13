export function computeNextAllowedAtMs(params: {
  nowMs: number;
  consecutiveFailures: number;
  baseMs: number;
  capMs: number;
  rand?: () => number;
}) {
  const rand = params.rand ?? Math.random;
  const failures = Math.max(0, Math.floor(params.consecutiveFailures));
  const baseMs = Math.max(0, params.baseMs);
  const capMs = Math.max(0, params.capMs);

  const maxDelay = Math.min(capMs, baseMs * 2 ** failures);
  const delay = rand() * maxDelay;
  return params.nowMs + delay;
}

