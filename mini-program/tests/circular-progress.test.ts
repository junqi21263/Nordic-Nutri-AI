import { describe, expect, it } from "vitest";
import { calculateCircularProgressPercent } from "../src/features/meals/nutrition-progress";

describe("circular progress ratio", () => {
  it("calculates a bounded current-to-target percentage", () => {
    expect(calculateCircularProgressPercent(61, 150)).toBe(41);
    expect(calculateCircularProgressPercent(150, 150)).toBe(100);
    expect(calculateCircularProgressPercent(180, 150)).toBe(100);
    expect(calculateCircularProgressPercent(0, 150)).toBe(0);
  });
});
