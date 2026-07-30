import { describe, expect, it } from "vitest";
import { getCoachGreeting } from "../src/features/coach/server-time";

describe("coach server-time greeting", () => {
  it("uses Asia/Shanghai server time for an afternoon greeting", () => {
    expect(getCoachGreeting("2026-07-29T08:36:00.000Z")).toBe("下午好");
  });

  it("does not show an incorrect time-of-day greeting before server time arrives", () => {
    expect(getCoachGreeting(null)).toBe("你好");
  });
});
