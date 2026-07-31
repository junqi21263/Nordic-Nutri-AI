import assert from "node:assert/strict";
import test from "node:test";

import promptModule from "./food-image-prompts.cjs";

const {
  buildFoodImagePrompt,
  buildFoodImagePromptPlan,
  MAX_PROMPT_CHARS,
  REJECT_REASON_CODES,
  formatRejectCorrection,
} = promptModule;

test("budget trim drops style before identity and correction", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "熟海螺",
    foodNameEn: "whelk cooked moist heat with very long english disambiguation text for identity",
    category: "贝类",
    categoryCode: "seafood",
    cookingMethod: "蒸",
    visualProfileKey: "cooked_plain",
    servingDescription: "一份约120克熟海螺肉摆盘用于营养记录展示请保留份量描述",
    retryReason: "上一张错误生成了完整闭壳生海螺；必须改为壳口打开、熟螺肉露出、不透明且没有活体触须，严禁鱼类形态。",
    imageSubjectZh: "壳口打开的清蒸熟海螺，熟螺肉完整露出，肉质灰白至米白、不透明且略微收缩，螺旋壳与可食用螺肉清楚可辨，禁止闭合壳",
    forceOverflow: true,
  });

  assert.ok(plan.prompt.length <= MAX_PROMPT_CHARS);
  assert.match(plan.prompt, /主体：熟海螺/);
  assert.match(plan.prompt, /闭壳生海螺|壳口打开|审核反馈修正/);
  assert.equal(plan.trimmedSlots?.includes("style"), true);
  assert.doesNotMatch(plan.prompt, /北欧自然光/);
});

test("category code selects meat template when the food name is obscure", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "精选部位A",
    categoryCode: "meat",
    category: "未分类原料",
    visualProfileKey: "raw",
  });
  assert.equal(plan.template, "meat_poultry");
  assert.match(plan.prompt, /生鲜未烹调|原料/);
  assert.doesNotMatch(plan.prompt, /轻烤|微焦/);
});

test("seafood category code plus whelk name still selects shellfish over generic fish", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "海螺",
    category: "海水鱼",
    categoryCode: "seafood",
    visualProfileKey: "cooked_plain",
    cookingMethod: "蒸",
  });
  assert.equal(plan.template, "shellfish_gastropod");
  assert.match(plan.prompt, /贝类，不是鱼类/);
});

test("reasonCode folds a coded correction fragment into the prompt", () => {
  const plan = buildFoodImagePromptPlan({
    foodNameZh: "豆腐",
    categoryCode: "soy",
    reasonCode: "wrong_identity",
    retryReason: "上一张生成了肉片",
  });
  assert.equal(plan.reasonCode, "wrong_identity");
  assert.match(plan.prompt, /根据审核反馈修正/);
  assert.match(plan.prompt, /勿生成其他品类|严格符合该食材/);
  assert.match(plan.prompt, /肉片/);
  assert.ok(REJECT_REASON_CODES.wrong_identity);
  assert.match(formatRejectCorrection("wrong_identity", "补充说明"), /补充说明/);
});

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
