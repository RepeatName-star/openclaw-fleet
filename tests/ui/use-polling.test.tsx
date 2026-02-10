/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, vi, test } from "vitest";
import { usePolling } from "../../ui/src/hooks/usePolling.js";

describe("usePolling", () => {
  test("runs on interval when enabled", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    let calls = 0;

    function Probe({ enabled }: { enabled: boolean }) {
      usePolling(() => {
        calls += 1;
      }, 1000, enabled);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Probe enabled={true} />);
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(calls).toBeGreaterThanOrEqual(2);

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  test("does not run when disabled", () => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    let calls = 0;

    function Probe({ enabled }: { enabled: boolean }) {
      usePolling(() => {
        calls += 1;
      }, 1000, enabled);
      return null;
    }

    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(<Probe enabled={false} />);
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(calls).toBe(0);

    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });
});
