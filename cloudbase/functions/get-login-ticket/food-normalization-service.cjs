// food-normalization-service.cjs
// Centralized name cleaning, search keyword generation, and auto-tag rules.
// Rules are owned here so controllers never hard-code thresholds.

const AUTO_TAG_RULES = [
  { code: "high_protein", test: (n) => n.protein_g >= 15 },
  { code: "low_fat", test: (n) => n.fat_g <= 3 },
  { code: "high_carb", test: (n) => n.carbs_g >= 30 },
  { code: "low_calorie", test: (n) => n.calories <= 100 },
  { code: "high_fiber", test: (n) => Number.isFinite(n.fiber_g) && n.fiber_g >= 5 },
  {
    code: "plant_protein",
    test: (n, ctx) => Array.isArray(ctx?.plantProteinCategories)
      && ctx.plantProteinCategories.includes(ctx?.categoryCode),
  },
];

function normalizeName(raw) {
  if (typeof raw !== "string") return "";
  let name = raw.trim();
  // Collapse whitespace.
  name = name.replace(/\s+/g, " ");
  // Strip leading/trailing punctuation.
  name = name.replace(/^[,;:|]+/, "").replace(/[,;:|]+$/, "");
  // Collapse repeated commas/semicolons.
  name = name.replace(/([,;])\s*([,;])/g, "$1");
  return name;
}

function normalizeNameEn(raw) {
  return normalizeName(raw).toLowerCase();
}

function generateSearchKeywords({ nameZh, nameEn, brandName, description } = {}) {
  const tokens = new Set();
  const push = (value) => {
    if (typeof value !== "string") return;
    const lower = value.toLowerCase().split(/[\s,./()\-'&|]+/).filter((t) => t.length >= 2);
    for (const token of lower) tokens.add(token);
  };
  push(nameZh);
  push(nameEn);
  push(brandName);
  push(description);
  return Array.from(tokens).slice(0, 24);
}

function detectAnomalies(nutrition) {
  const flags = [];
  const c = Number(nutrition?.calories);
  const p = Number(nutrition?.protein_g);
  const f = Number(nutrition?.fat_g);
  const cb = Number(nutrition?.carbs_g);
  if (Number.isFinite(c) && c > 900) flags.push("calories_extreme");
  if (Number.isFinite(p) && p > 95) flags.push("protein_extreme");
  if (Number.isFinite(f) && f > 95) flags.push("fat_extreme");
  if (Number.isFinite(cb) && cb > 95) flags.push("carbs_extreme");
  // Macro sum sanity (per 100g, kcal): 4*P + 4*C + 9*F should be within ~30% of calories.
  if (Number.isFinite(c) && c > 0 && Number.isFinite(p) && Number.isFinite(f) && Number.isFinite(cb)) {
    const computed = 4 * p + 4 * cb + 9 * f;
    if (computed > 0 && Math.abs(computed - c) / c > 0.5) flags.push("macro_mismatch");
  }
  return flags;
}

function autoTags(nutrition, ctx) {
  const tags = [];
  for (const rule of AUTO_TAG_RULES) {
    try {
      if (rule.test(nutrition || {}, ctx)) tags.push(rule.code);
    } catch {
      // A failing rule must never block the others.
    }
  }
  return tags;
}

function normalizeFoodRecord(input, ctx = {}) {
  const nameEn = normalizeName(input?.name_en ?? input?.description ?? "");
  const nameZh = normalizeName(input?.name_zh ?? "");
  const normalized = normalizeNameEn(nameEn || nameZh);
  const nutrition = {
    calories: Number(input?.calories ?? 0) || 0,
    protein_g: Number(input?.protein_g ?? 0) || 0,
    carbs_g: Number(input?.carbs_g ?? 0) || 0,
    fat_g: Number(input?.fat_g ?? 0) || 0,
    fiber_g: Number(input?.fiber_g ?? null),
    sugar_g: Number(input?.sugar_g ?? null),
    sodium_mg: Number(input?.sodium_mg ?? null),
  };
  return {
    name_zh: nameZh || null,
    name_en: nameEn || null,
    normalized_name: normalized,
    brand_name: input?.brand_name ? normalizeName(input.brand_name) : null,
    description: input?.description ? normalizeName(input.description) : null,
    search_keywords: generateSearchKeywords({
      nameZh,
      nameEn,
      brandName: input?.brand_name,
      description: input?.description,
    }),
    nutrition,
    anomalies: detectAnomalies(nutrition),
    auto_tags: autoTags(nutrition, { ...ctx, categoryCode: ctx?.categoryCode }),
  };
}

module.exports = {
  AUTO_TAG_RULES,
  autoTags,
  detectAnomalies,
  generateSearchKeywords,
  normalizeFoodRecord,
  normalizeName,
  normalizeNameEn,
};
