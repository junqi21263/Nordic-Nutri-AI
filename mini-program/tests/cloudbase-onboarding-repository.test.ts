import { describe, expect, it } from "vitest";
import { completeCloudbaseOnboarding } from "../src/repositories/cloudbase-onboarding-repository";

type Row = Record<string, unknown>;

function createClient() {
  const inserts: Array<{ table: string; payload: Row }> = [];
  const updates: Array<{ table: string; payload: Row; id: string }> = [];
  const ids = { user_goals: "goal-1", body_profiles: "body-1", nutrition_plans: "plan-1" };

  return {
    inserts,
    updates,
    client: {
      from(table: string) {
        return {
          insert(payload: Row) {
            inserts.push({ table, payload });
            return { select: () => ({ single: async () => ({ data: { id: ids[table as keyof typeof ids] }, error: null }) }) };
          },
          update(payload: Row) {
            return {
              eq(_column: string, id: string) {
                updates.push({ table, payload, id });
                return { select: () => ({ single: async () => ({ data: { id }, error: null }) }) };
              },
            };
          },
        };
      },
    },
  };
}

describe("completeCloudbaseOnboarding", () => {
  it("persists the completed onboarding without client-supplied owner fields", async () => {
    const fake = createClient();

    await completeCloudbaseOnboarding(fake.client, "business-user", {
      goalType: "muscle_gain",
      targetWeightKg: 72,
      targetDate: "2026-08-01",
      age: 28,
      sex: "male",
      heightCm: 175,
      weightKg: 70,
      activityLevel: "moderate",
      trainingDays: 4,
      dietaryPattern: "none",
      foodAvoidances: ["dairy"],
      mealsPerDay: 3,
      calories: 2700,
      proteinG: 140,
      carbsG: 310,
      fatG: 63,
    });

    expect(fake.inserts.map((entry) => entry.table)).toEqual(["user_goals", "body_profiles", "nutrition_plans"]);
    for (const entry of fake.inserts) expect(entry.payload).not.toHaveProperty("user_id");
    expect(fake.inserts[2]?.payload).toMatchObject({ goal_id: "goal-1", body_profile_id: "body-1" });
    expect(fake.updates).toContainEqual(expect.objectContaining({
      table: "user_settings",
      id: "business-user",
      payload: expect.objectContaining({ dietary_pattern: "none", food_avoidances: ["dairy"], meals_per_day: 3 }),
    }));
    expect(fake.updates).toContainEqual(expect.objectContaining({
      table: "profiles",
      id: "business-user",
      payload: expect.objectContaining({ onboarding_completed_at: expect.any(String) }),
    }));
  });
});
