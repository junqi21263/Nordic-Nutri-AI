import { describe, expect, it } from "vitest";
import { getCelebrationOverlayPriority } from "../src/features/coach/celebration-overlay-priority";

describe("celebration overlay priority", () => {
  it("keeps a queued achievement behind the active meal-saved celebration", () => {
    expect(getCelebrationOverlayPriority({ hasSavedMeal: true, hasAchievement: true })).toBe("meal-saved");
  });

  it("shows the queued achievement immediately after the meal-saved celebration is dismissed", () => {
    expect(getCelebrationOverlayPriority({ hasSavedMeal: false, hasAchievement: true })).toBe("achievement");
  });

  it("does not render an overlay when neither celebration is active", () => {
    expect(getCelebrationOverlayPriority({ hasSavedMeal: false, hasAchievement: false })).toBeNull();
  });
});
