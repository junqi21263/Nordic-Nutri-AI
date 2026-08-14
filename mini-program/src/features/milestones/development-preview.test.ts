import { describe, expect, it } from "vitest";
import { getMilestonePreviewUrl } from "./development-preview";

describe("getMilestonePreviewUrl", () => {
  it("opens the selected mock milestone without production data writes", () => {
    expect(getMilestonePreviewUrl(14)).toBe("/pages/milestone-poster/index?milestone=14&demo=1");
  });
});
