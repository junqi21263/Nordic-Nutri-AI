import assert from "node:assert/strict";
import test from "node:test";

import { createOnboardingDraftDataService } from "./onboarding-draft-data-service.cjs";

test("upserts a bounded onboarding draft for its authenticated owner", async () => {
  const writes = [];
  const db = {
    from(table) {
      return {
        upsert(payload, options) {
          writes.push({ table, payload, options });
          return { select: () => ({ single: async () => ({ data: { payload: payload.payload }, error: null }) }) };
        },
      };
    },
  };
  const service = createOnboardingDraftDataService({ db });
  const draft = await service.save("user-1", {
    nickname: "北欧小林", goalType: "muscle_gain", age: "28", gender: "male",
    heightCm: "175", weightKg: "70", activityLevel: "moderate", trainingDays: "4",
    targetWeightKg: "74", targetDate: "2026-12-01", dietaryPattern: "none",
    foodAvoidances: ["dairy"], mealsPerDay: "3",
  });

  assert.equal(writes[0].table, "onboarding_drafts");
  assert.equal(writes[0].payload.user_id, "user-1");
  assert.equal(writes[0].options.onConflict, "user_id");
  assert.equal(draft.goalType, "muscle_gain");
});

test("rejects unrecognized onboarding draft fields before persistence", async () => {
  const service = createOnboardingDraftDataService({ db: { from: () => { throw new Error("must not write"); } } });
  await assert.rejects(
    () => service.save("user-1", { goalType: "muscle_gain", injected: "no" }),
    /无效/,
  );
});
