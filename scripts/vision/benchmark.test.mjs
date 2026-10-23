import assert from "node:assert/strict";
import test from "node:test";
import { scoreRecognition, recognize } from "./benchmark.mjs";
const sample = {
  id: "rice",
  sha256: "test",
  expected: [["rice", "米饭"]],
  forbidden: ["beef"],
};
const result = {
  mealName: "rice",
  mealType: "lunch",
  confidence: 0.9,
  items: [
    {
      name: "rice",
      quantityG: 100,
      caloriesPer100g: 130,
      proteinPer100g: 2,
      carbsPer100g: 28,
      fatPer100g: 0.3,
    },
  ],
};
test("recognition scoring reports omissions without pretending nutrition truth", () => {
  assert.equal(scoreRecognition(sample, result).automaticChecksPassed, true);
  assert.equal(scoreRecognition(sample, result).nutritionAccuracy, null);
  assert.equal(
    scoreRecognition({ ...sample, expected: [["beef"]] }, result).missing
      .length,
    1,
  );
});
test("benchmark polls accepted jobs and records actual completion rather than 202 success", async () => {
  let calls = 0,
    clock = 0;
  const r = await recognize({
    baseUrl: "https://test",
    token: "private",
    sample,
    bytes: Buffer.from("image"),
    now: () => clock,
    sleep: async (ms) => {
      clock += ms;
    },
    request: async () => ({
      ok: true,
      json: async () =>
        ++calls === 1
          ? { status: "processing", analysisId: "id" }
          : { status: "completed", analysisId: "id", result },
    }),
  });
  assert.equal(calls, 2);
  assert.equal(r.totalMs, 1500);
  assert.equal(r.score.schemaValid, true);
  assert.equal(JSON.stringify(r).includes("private"), false);
});
