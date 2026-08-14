import { describe, expect, it } from "vitest";
import { createInitialMilestonePresentation } from "./presentation-state";

describe("createInitialMilestonePresentation", () => {
  it("resolves preview fixtures before the first render", () => {
    const presentation = createInitialMilestonePresentation({ milestone: 7, isDemo: true });

    expect(presentation.pending).toBe(false);
    expect(presentation.value?.milestone).toBe(7);
    expect(presentation.value?.recordedDays).toBe(7);
    expect(presentation.value?.illustration).toBeTruthy();
  });

  it("creates a stable poster shell when live data is not cached", () => {
    const presentation = createInitialMilestonePresentation({ milestone: 14, isDemo: false });

    expect(presentation.pending).toBe(true);
    expect(presentation.value?.milestone).toBe(14);
    expect(presentation.value?.personalizedMessage).toBeTruthy();
  });
});
