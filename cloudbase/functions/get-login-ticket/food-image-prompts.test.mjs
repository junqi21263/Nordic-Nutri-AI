import assert from "node:assert/strict";
import test from "node:test";

import promptModule from "./food-image-prompts.cjs";

const { buildFoodImagePrompt, buildFoodImagePromptPlan } = promptModule;

test("buildFoodImagePromptPlan selects an egg-specific composition and excludes unrelated dishes", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "鸡蛋",
    category: "蛋类与乳制品",
  });

  assert.equal(plan.template, "egg_dairy");
  assert.match(plan.subject, /完整鸡蛋/);
  assert.match(plan.negativePrompt, /勿增加肉类/);
  assert.match(plan.prompt, /鸡蛋/);
});

test("explicit extra prompt overrides automatic serving guidance without replacing the food identity", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "鸡胸肉",
    category: "肉禽",
    cookingMethod: "水煮",
    extraPrompt: "切片摆放，保持自然白色",
  });

  assert.equal(plan.template, "meat_poultry");
  assert.match(plan.prompt, /主体：鸡胸肉/);
  assert.match(plan.prompt, /切片摆放/);
  assert.match(plan.prompt, /水煮/);
  assert.equal(buildFoodImagePrompt(plan), plan.prompt);
});

test("review rejection is folded into the next prompt without losing the food template", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "鸡蛋",
    category: "蛋类与乳制品",
    retryReason: "蛋黄颜色不自然，改为真实水煮蛋切面",
  });

  assert.equal(plan.template, "egg_dairy");
  assert.match(plan.extraPrompt, /蛋黄颜色不自然/);
  assert.match(plan.prompt, /根据审核反馈修正/);
});
