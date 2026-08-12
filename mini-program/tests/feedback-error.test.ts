import { describe, expect, it } from "vitest";
import { feedbackVariantForError, isFeedbackQuotaError } from "../src/features/feedback/feedback-error";

describe("feedback error mapping", () => {
  it("maps confirmed daily quota exhaustion to the limit variant", () => {
    expect(isFeedbackQuotaError({ code: "COACH_DAILY_LIMIT_REACHED" })).toBe(true);
    expect(feedbackVariantForError({ code: "VISION_QUOTA_EXHAUSTED" })).toBe("limit");
  });

  it("keeps transient rate limiting and unrelated failures in the error variant", () => {
    expect(feedbackVariantForError(Object.assign(new Error("try again later"), { name: "RATE_LIMITED" }))).toBe("error");
    expect(feedbackVariantForError(new Error("network unavailable"))).toBe("error");
  });
});
