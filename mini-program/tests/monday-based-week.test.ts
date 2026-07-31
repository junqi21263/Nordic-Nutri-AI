import { describe, expect, it } from "vitest";
import { getMondayBasedWeekDates } from "../src/features/meals/domain";

describe("getMondayBasedWeekDates", () => {
  it("returns Monday through Sunday for a mid-week date", () => {
    // Friday 2026-07-31 → Mon 27 … Sun Aug 2
    expect(getMondayBasedWeekDates("2026-07-31")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("treats Sunday as the end of the Monday-based week", () => {
    expect(getMondayBasedWeekDates("2026-08-02")).toEqual([
      "2026-07-27",
      "2026-07-28",
      "2026-07-29",
      "2026-07-30",
      "2026-07-31",
      "2026-08-01",
      "2026-08-02",
    ]);
  });

  it("starts on the same day when the date is already Monday", () => {
    expect(getMondayBasedWeekDates("2026-07-27")[0]).toBe("2026-07-27");
    expect(getMondayBasedWeekDates("2026-07-27")[6]).toBe("2026-08-02");
  });
});
