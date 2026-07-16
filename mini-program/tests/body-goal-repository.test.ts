import { describe, expect, it, vi } from "vitest";
import { ageOnDate, createBodyProfileRepository } from "../src/repositories/body-profile-repository";
import { toDatabaseGoalType, validateGoalInput } from "../src/repositories/health-goal-repository";

describe("body profile and goal repositories", () => {
  it("derives age with a month/day boundary for a new version", async () => {
    const insert = vi.fn((payload: unknown) => ({ select: () => ({ single: async () => ({ data: payload, error: null }) }) }));
    const repository = createBodyProfileRepository({ from: vi.fn(() => ({ insert })) });

    await repository.saveVersion("u1", {
      birthDate: "1995-07-17",
      sex: "male",
      heightCm: 175,
      weightKg: 70,
      activityLevel: "moderate",
      trainingDays: 3,
    }, "2026-07-16");

    expect(ageOnDate("1995-07-17", "2026-07-16")).toBe(30);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ age: 30, birth_date: "1995-07-17", is_current: true }));
  });

  it("maps maintenance and rejects a target date that is not later than today", () => {
    expect(toDatabaseGoalType("maintenance")).toBe("maintain");
    expect(() => validateGoalInput({ goalType: "muscle_gain", targetWeightKg: 74, targetDate: "2026-07-16" }, "2026-07-16")).toThrow("目标日期必须晚于今天");
  });
});
