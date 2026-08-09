import { describe, expect, it } from "vitest";
import { getCoachGreeting } from "../src/features/coach/server-time";

describe("coach server-time greeting", () => {
  it("uses Asia/Shanghai server time for an afternoon greeting", () => {
    expect(getCoachGreeting("2026-07-29T08:36:00.000Z")).toBe("下午好");
  });

  it("uses a concise weekday early-morning greeting at 02:36 Shanghai time", () => {
    expect(getCoachGreeting("2026-08-06T18:36:00.000Z")).toBe("还没休息");
  });

  it("uses a concise weekend early-morning greeting at 02:36 Shanghai time", () => {
    expect(getCoachGreeting("2026-08-07T18:36:00.000Z")).toBe("夜还很静");
  });

  it("uses the weekend morning greeting in Shanghai time", () => {
    expect(getCoachGreeting("2026-08-08T00:30:00.000Z")).toBe("周末早上好");
  });

  it("keeps an evening greeting before the late-night period", () => {
    expect(getCoachGreeting("2026-08-08T14:59:00.000Z")).toBe("晚上好");
  });

  it("does not show an incorrect time-of-day greeting before server time arrives", () => {
    expect(getCoachGreeting(null)).toBe("你好");
  });
});
