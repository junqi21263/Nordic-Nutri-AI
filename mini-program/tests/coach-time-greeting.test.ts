import { describe, expect, it } from "vitest";
import { getCoachGreeting } from "../src/features/coach/server-time";

describe("coach time greeting", () => {
  it("uses the same Shanghai late-night greeting for every page", () => {
    expect(getCoachGreeting("2026-08-10T16:36:00.000Z")).toBe("夜深了");
  });

  it("uses the same Shanghai afternoon greeting for every page", () => {
    expect(getCoachGreeting("2026-08-10T07:36:00.000Z")).toBe("下午好");
  });
});
