import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const source = resolve(root, "mini-program", "src");
const read = (path) => readFileSync(resolve(source, path), "utf8");

test("design system exposes complete Stitch-aligned tokens", () => {
  const tokens = read("styles/tokens.scss");
  for (const token of [
    "$color-forest-green", "$color-dark-forest", "$color-sage", "$color-warm-white", "$color-soft-beige",
    "$color-neutral-gray", "$color-success", "$color-warning", "$color-error", "$color-text-primary",
    "$color-text-secondary", "$color-divider", "$color-background", "$color-surface", "$color-card",
    "$font-display", "$font-h1", "$font-h2", "$font-h3", "$font-body", "$font-caption", "$font-overline",
    "$radius-4", "$radius-8", "$radius-12", "$radius-16", "$radius-24", "$radius-full",
    "$shadow-small", "$shadow-medium", "$shadow-large", "$space-4", "$space-48", "$duration-base", "$ease-standard",
  ]) assert.match(tokens, new RegExp(`\\${token}`));
});

test("UI foundation contains all reusable components", () => {
  for (const component of [
    "app-button", "app-card", "nutrition-card", "meal-card", "macro-progress", "circular-progress", "nutrition-tag",
    "ai-insight-card", "list-item", "avatar", "section-title", "statistic-card", "action-card", "bottom-tab-bar",
    "top-navigation", "search-bar", "chip", "badge", "toast", "modal", "bottom-sheet", "floating-action-button",
    "loading", "skeleton", "empty-state", "error-state",
  ]) assert.ok(existsSync(resolve(source, "components", component, "index.tsx")), component);
});

test("component styles use tokens rather than raw hexadecimal colours", () => {
  const styles = `${read("styles/components.scss")}\n${read("styles/global.scss")}`;
  assert.doesNotMatch(styles, /#[0-9a-f]{3,8}/i);
  assert.match(styles, /\$duration-base/);
  assert.match(styles, /\[data-theme="dark"\]/);
});

test("formal UI pages are composed layouts and not state placeholders", () => {
  for (const page of [
    "onboarding", "body-profile", "nutrition-plan", "home", "food-scanner", "analysis-result", "meal-detail", "meal-records", "coach", "profile",
  ]) {
    const content = read(`pages/${page}/index.tsx`);
    assert.match(content, /PageLayout/);
    assert.doesNotMatch(content, /PageStateSlot/);
  }
});

test("first-use pages remain local-only and do not invoke remote services", () => {
  for (const page of ["onboarding", "body-profile", "nutrition-plan"]) {
    const content = read(`pages/${page}/index.tsx`);
    assert.doesNotMatch(content, /\bfetch\s*\(|supabase|invoke\s*\(|request\s*\(/i);
  }
});

test("meal flow keeps detail errors, local-only pages, and progress fallback", () => {
  const detail = read("pages/meal-detail/index.tsx");
  const circularProgress = read("components/circular-progress/index.tsx");
  assert.match(detail, /ErrorState/);
  assert.match(circularProgress, /ProgressFallback/);
  for (const page of ["home", "meal-records", "meal-detail"]) {
    const content = read(`pages/${page}/index.tsx`);
    assert.doesNotMatch(content, /\bfetch\s*\(|supabase|invoke\s*\(|request\s*\(/i);
  }
});

test("scanner flow remains fixture-only with all local state boundaries", () => {
  for (const file of [
    "pages/food-scanner/index.tsx",
    "pages/analysis-result/index.tsx",
    "pages/portion-adjustment/index.tsx",
    "features/scanner/domain.ts",
    "stores/scanner-store.ts",
    "stores/analysis-store.ts",
    "stores/portion-draft-store.ts",
  ]) {
    const content = read(file);
    assert.doesNotMatch(content, /\bfetch\s*\(|supabase|invoke\s*\(|request\s*\(/i);
  }
  assert.match(read("pages/food-scanner/index.tsx"), /captureRandom/);
  assert.match(read("pages/analysis-result/index.tsx"), /addMeal/);
  assert.match(read("pages/portion-adjustment/index.tsx"), /Slider/);
});
