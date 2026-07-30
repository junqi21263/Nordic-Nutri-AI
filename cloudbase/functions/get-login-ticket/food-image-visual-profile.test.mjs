import assert from "node:assert/strict";
import test from "node:test";

import visualProfileModule from "./food-image-visual-profile.cjs";

const {
  inferVisualProfileKey,
  resolveVisualProfile,
  getVisualProfileDefinition,
} = visualProfileModule;

test("chicken breast defaults to one raw visual profile even with many nutrition variants", () => {
  const profile = resolveVisualProfile({
    nameZh: "鸡胸肉",
    category: { nameZh: "肉禽", code: "meat-poultry" },
    variantLabelZh: "推荐版本",
  });

  assert.equal(profile.key, "raw");
  assert.equal(profile.labelZh, "生鲜原料");
  assert.match(profile.promptHint, /生鲜未烹调/);
});

test("a cooked nutrition variant resolves to the cooked-plain profile", () => {
  assert.equal(inferVisualProfileKey({
    nameZh: "鸡胸肉",
    category: { nameZh: "肉禽" },
    variantLabelZh: "熟制",
  }), "cooked_plain");
});

test("a grilled food form resolves to its own cooked visual profile", () => {
  assert.equal(inferVisualProfileKey({
    nameZh: "烤海螺",
    category: { nameZh: "贝类" },
    defaultCookingMethod: "烤",
    foodForm: "cooked",
  }), "cooked_grilled");
});

test("an explicit batch profile overrides automatic inference and exposes a safe prompt hint", () => {
  const profile = resolveVisualProfile({
    nameZh: "鸡胸肉",
    category: { nameZh: "肉禽" },
  }, "cooked_plain");

  assert.equal(profile.key, "cooked_plain");
  assert.match(profile.promptHint, /清淡熟制/);
  assert.equal(getVisualProfileDefinition("not-real").key, "standard");
});
