import assert from "node:assert/strict";
import test from "node:test";

import {
  autoTags,
  detectAnomalies,
  generateSearchKeywords,
  normalizeFoodRecord,
  normalizeName,
} from "./food-normalization-service.cjs";

test("normalizeName collapses whitespace and trims punctuation", () => {
  assert.equal(normalizeName("  Chicken,  breast  "), "Chicken, breast");
  assert.equal(normalizeName(",,Salmon;;"), "Salmon");
  assert.equal(normalizeName(""), "");
  assert.equal(normalizeName(null), "");
});

test("generateSearchKeywords dedupes and filters short tokens", () => {
  const kw = generateSearchKeywords({
    nameZh: "鸡胸肉",
    nameEn: "Chicken breast",
    brandName: "USDA",
    description: "Chicken, broilers or fryers a",
  });
  assert.ok(kw.includes("chicken"));
  assert.ok(kw.includes("breast"));
  assert.ok(kw.includes("usda"));
  // 1-char tokens are filtered out; 2-char tokens like "or" are kept.
  assert.ok(!kw.includes("a"));
  assert.equal(new Set(kw).size, kw.length);
});

test("autoTags applies threshold rules", () => {
  assert.deepEqual(autoTags({ protein_g: 20, fat_g: 10, carbs_g: 5, calories: 200, fiber_g: 1 }), ["high_protein"]);
  assert.deepEqual(autoTags({ protein_g: 5, fat_g: 2, carbs_g: 40, calories: 90, fiber_g: 6 }), [
    "low_fat", "high_carb", "low_calorie", "high_fiber",
  ]);
  assert.deepEqual(autoTags({ protein_g: 5, fat_g: 2, carbs_g: 40, calories: 90, fiber_g: 6 }, {
    plantProteinCategories: ["soy", "grain"],
    categoryCode: "soy",
  }), ["low_fat", "high_carb", "low_calorie", "high_fiber", "plant_protein"]);
});

test("detectAnomalies flags extreme values and macro mismatch", () => {
  assert.ok(detectAnomalies({ calories: 1000, protein_g: 5, fat_g: 5, carbs_g: 5 }).includes("calories_extreme"));
  assert.ok(detectAnomalies({ calories: 100, protein_g: 50, fat_g: 50, carbs_g: 50 }).includes("macro_mismatch"));
  assert.deepEqual(detectAnomalies({ calories: 165, protein_g: 31, fat_g: 3.6, carbs_g: 0 }), []);
});

test("normalizeFoodRecord produces a complete normalized record", () => {
  const rec = normalizeFoodRecord({
    name_en: "  Chicken, breast ",
    brand_name: "USDA",
    calories: 165,
    protein_g: 31,
    carbs_g: 0,
    fat_g: 3.6,
  }, { categoryCode: "meat" });
  assert.equal(rec.normalized_name, "chicken, breast");
  assert.ok(rec.search_keywords.includes("chicken"));
  assert.ok(rec.auto_tags.includes("high_protein"));
  assert.equal(rec.anomalies.length, 0);
  assert.equal(rec.nutrition.calories, 165);
});
