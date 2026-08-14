import { describe, expect, it } from "vitest";
import {
  consumeMilestoneClaim,
  getMilestonePosterUrl,
  shouldClaimAfterMealSave,
} from "./runtime";

describe("milestone runtime", () => {
  it("opens first presentation with only event identity and claim token", () => {
    expect(getMilestonePosterUrl({ eventId: "event-1", claimToken: "token-1" }))
      .toBe("/pages/milestone-poster/index?eventId=event-1&claimToken=token-1");
  });

  it("opens history review with event identity only", () => {
    expect(getMilestonePosterUrl({ eventId: "event-1" }))
      .toBe("/pages/milestone-poster/index?eventId=event-1");
  });

  it("never claims immediately for a backfilled meal", () => {
    expect(shouldClaimAfterMealSave("2026-08-12T09:00:00+08:00", "2026-08-13T12:00:00+08:00")).toBe(false);
    expect(shouldClaimAfterMealSave("2026-08-13T09:00:00+08:00", "2026-08-13T12:00:00+08:00")).toBe(true);
  });

  it("consumes each claimed event only once per session", () => {
    const consumed = new Set<string>();
    expect(consumeMilestoneClaim(consumed, "event-1")).toBe(true);
    expect(consumeMilestoneClaim(consumed, "event-1")).toBe(false);
    expect(consumeMilestoneClaim(consumed, "event-2")).toBe(true);
  });
});
