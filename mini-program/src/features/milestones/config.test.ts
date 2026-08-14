import { describe, expect, it } from "vitest";
import { MILESTONE_CONFIG } from "./config";

describe("milestone illustration assets", () => {
  it("uses real-device Canvas-compatible JPEG assets", () => {
    const illustrations = Object.values(MILESTONE_CONFIG).flatMap((config) => config.illustrations);
    expect(illustrations.length).toBe(10);
    expect(illustrations.every((path) => path.endsWith(".jpg"))).toBe(true);
  });
});
