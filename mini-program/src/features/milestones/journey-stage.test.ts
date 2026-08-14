import { describe, expect, it } from "vitest";
import {
  JOURNEY_STAGE_CONFIG,
  getJourneyStageState,
  getJourneyStageStatusLabel,
  getRepresentativeJourneyCover,
  type JourneyStageState,
} from "./journey-stage";

describe("Journey stage presentation", () => {
  const stateFor = (state: JourneyStageState) => state;

  it("keeps event state authoritative over the visible stage state", () => {
    expect(getJourneyStageState({ milestone: 3, event: { status: "presented" }, nextMilestone: 7 })).toBe(stateFor("presented"));
    expect(getJourneyStageState({ milestone: 3, event: { status: "pending" }, nextMilestone: 7 })).toBe(stateFor("pending"));
    expect(getJourneyStageState({ milestone: 3, event: { status: "invalidated" }, nextMilestone: 7 })).toBe(stateFor("locked"));
  });

  it("marks only the next non-event threshold as next", () => {
    expect(getJourneyStageState({ milestone: 7, event: null, nextMilestone: 7 })).toBe(stateFor("next"));
    expect(getJourneyStageState({ milestone: 14, event: null, nextMilestone: 7 })).toBe(stateFor("locked"));
  });

  it("never labels a pending event as locked", () => {
    expect(getJourneyStageStatusLabel("pending", 3, 3)).toBe("已解锁 · 待展示");
  });

  it("keeps the Stitch collection counts and representative covers data-driven", () => {
    expect(Object.values(JOURNEY_STAGE_CONFIG).map((stage) => stage.collectionCount)).toEqual([3, 3, 2, 2]);
    expect(getRepresentativeJourneyCover(3).id).toBe("start-breakfast");
    expect(getRepresentativeJourneyCover(7).id).toBe("rhythm-weekly-a");
  });
});
