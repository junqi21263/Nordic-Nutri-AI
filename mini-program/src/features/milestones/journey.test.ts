import { describe, expect, it } from "vitest";
import {
  getCurrentJourneyEvents,
  getCurrentJourneyMilestoneEvent,
  getHighestPresentedMilestone,
  getNextMilestone,
} from "./journey";

describe("milestone journey", () => {
  const journey = {
    currentStreakDays: 8,
    highestMilestone: 7 as const,
    cycles: [
      { id: "old", start_date: "2026-08-01", status: "ended" as const },
      { id: "current", start_date: "2026-08-10", status: "active" as const },
    ],
    events: [
      { id: "old-3", cycle_id: "old", milestone: 3 as const, status: "presented" as const, presentation_snapshot: null },
      { id: "current-3", cycle_id: "current", milestone: 3 as const, status: "presented" as const, presentation_snapshot: null },
      { id: "current-7", cycle_id: "current", milestone: 7 as const, status: "presented" as const, presentation_snapshot: null },
    ],
  };

  it("only exposes events for the current canonical cycle", () => {
    expect(getCurrentJourneyEvents(journey).map((event) => event.id)).toEqual(["current-3", "current-7"]);
  });

  it("opens the highest presented milestone in the current cycle", () => {
    expect(getHighestPresentedMilestone(getCurrentJourneyEvents(journey))?.id).toBe("current-7");
  });

  it("treats a pending event in the current canonical cycle as unlocked", () => {
    const pendingJourney = {
      ...journey,
      events: [
        { id: "old-3", cycle_id: "old", milestone: 3 as const, status: "presented" as const, presentation_snapshot: null },
        { id: "current-3", cycle_id: "current", milestone: 3 as const, status: "pending" as const, presentation_snapshot: null },
      ],
    };
    const events = getCurrentJourneyEvents(pendingJourney);

    expect(getCurrentJourneyMilestoneEvent(events, 3)?.id).toBe("current-3");
    expect(getCurrentJourneyMilestoneEvent(events, 3)?.status).toBe("pending");
  });

  it("does not pretend there is a next milestone after 30 days", () => {
    expect(getNextMilestone(8)).toBe(14);
    expect(getNextMilestone(30)).toBeNull();
  });
});
