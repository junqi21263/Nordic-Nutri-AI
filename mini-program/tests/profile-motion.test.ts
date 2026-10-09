import { describe, expect, it, vi } from "vitest";
import { animateProfileNumber, profileWeekday } from "../src/pages/profile/profile-motion";

describe("profile motion and date labels", () => {
  it("labels server dates without UTC timezone drift", () => {
    expect(profileWeekday("2026-09-14")).toBe("一");
    expect(profileWeekday("2026-09-20")).toBe("日");
    expect(profileWeekday("invalid")).toBe("—");
  });

  it("settles exactly on the real value and leaves no scheduled frame", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let id = 0;
    vi.stubGlobal("requestAnimationFrame", (fn: FrameRequestCallback) => { frames.set(++id, fn); return id; });
    vi.stubGlobal("cancelAnimationFrame", (key: number) => frames.delete(key));
    const values: number[] = [];
    const cancel = animateProfileNumber(3140, (value) => values.push(value));
    for (const time of [0, 380, 760]) {
      const current = [...frames.values()]; frames.clear(); current.forEach((fn) => fn(time));
    }
    expect(values[0]).toBe(0);
    expect(values[1]).toBeGreaterThan(0);
    expect(values.at(-1)).toBe(3140);
    expect(frames.size).toBe(0);
    cancel();
    vi.unstubAllGlobals();
  });

  it("cancels frames on hide/unmount and never fabricates progress for zero", () => {
    const request = vi.fn().mockReturnValue(42);
    const cancelFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancelFrame);
    const update = vi.fn();
    animateProfileNumber(0, update);
    expect(update).toHaveBeenLastCalledWith(0);
    expect(request).not.toHaveBeenCalled();
    const cancel = animateProfileNumber(12, update);
    cancel();
    expect(cancelFrame).toHaveBeenCalledWith(42);
    const calls = update.mock.calls.length;
    request.mock.calls[0][0](300);
    expect(update.mock.calls).toHaveLength(calls);
    vi.unstubAllGlobals();
  });
});
