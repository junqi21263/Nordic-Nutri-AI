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
  assert.doesNotMatch(plan.prompt, /根据审核反馈修正：[^。]*根据审核反馈修正：/);
});

test("cooked whelk uses a shellfish template and explicit cooked visual anchors despite a bad fish category", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "熟海螺",
    foodNameEn: "whelk cooked moist heat",
    category: "海水鱼",
    cookingMethod: "蒸",
    visualProfileKey: "cooked_plain",
  });

  assert.equal(plan.template, "shellfish_gastropod");
  assert.match(plan.prompt, /贝类，不是鱼类/);
  assert.match(plan.prompt, /壳口打开/);
  assert.match(plan.prompt, /不透明/);
  assert.match(plan.prompt, /闭合海螺/);
  assert.doesNotMatch(plan.prompt, /蒸烹饪/);
});

test("review correction is retained before style text when a prompt reaches the character budget", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "熟海螺",
    foodNameEn: "whelk cooked moist heat",
    category: "贝类",
    cookingMethod: "蒸",
    visualProfileKey: "cooked_plain",
    retryReason: "上一张错误生成了完整闭壳生海螺；必须改为壳口打开、熟螺肉露出、不透明且没有活体触须。",
  });

  assert.match(plan.prompt, /上一张错误生成了完整闭壳生海螺/);
  assert.ok(plan.prompt.indexOf("根据审核反馈修正") < plan.prompt.indexOf("北欧自然光"));
});

test("a verified per-food visual subject supplements the canonical template for difficult foods", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "熟海螺",
    category: "贝类",
    cookingMethod: "清蒸",
    visualProfileKey: "cooked_plain",
    imageSubjectZh: "壳口打开的清蒸熟海螺，熟螺肉完整露出，肉质不透明且略微收缩",
  });

  assert.match(plan.prompt, /壳口打开的清蒸熟海螺/);
  assert.match(plan.prompt, /闭合海螺/);
});

test("grilled shellfish keeps cooked anchors while requesting the correct dry-heat finish", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "烤海螺",
    category: "贝类",
    cookingMethod: "烤",
    visualProfileKey: "cooked_grilled",
  });

  assert.match(plan.prompt, /轻烤熟制/);
  assert.match(plan.prompt, /肉质灰白至米白、不透明/);
  assert.doesNotMatch(plan.prompt, /蒸烹饪/);
});
