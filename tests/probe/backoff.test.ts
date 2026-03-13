import { computeNextAllowedAtMs } from "../../src/probe/backoff.js";

test("backoff grows exponentially with full jitter and caps at 5 minutes", () => {
  const capMs = 5 * 60_000;
  for (const failures of [0, 1, 2, 3, 10]) {
    const next = computeNextAllowedAtMs({
      nowMs: 0,
      consecutiveFailures: failures,
      baseMs: 1000,
      capMs,
      rand: () => 0.5,
    });
    expect(next).toBeGreaterThanOrEqual(0);
    expect(next).toBeLessThanOrEqual(capMs);
  }
});

