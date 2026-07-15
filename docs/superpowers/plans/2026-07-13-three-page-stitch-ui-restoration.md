# Three-page Stitch UI restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the WeChat onboarding, body-profile, and nutrition-plan flow to the supplied Stitch hierarchy while retaining Chinese copy and local draft/plan behavior.

**Architecture:** Replace the onboarding-only capsule measurement with a typed shared navigation-metrics utility and an `AppNavbar` component. The three route pages consume that component and scoped page styles; the existing Zustand store and nutrition-domain calculations remain unchanged. Local SVG icons provide the single icon source.

**Tech Stack:** Taro 4, React 18, TypeScript, Sass, Vitest, WeChat Developer Tools.

---

## File map

- Create: `mini-program/src/components/app-navbar/index.tsx` — shared custom WeChat header.
- Create: `mini-program/src/components/nordic-icon/index.tsx` — typed local SVG-style icon primitive.
- Modify: `mini-program/src/utils/onboarding-navigation.ts` — return status, navbar, total, title-safe and capsule geometry.
- Modify: `mini-program/src/utils/use-menu-button-metrics.ts` — use `Taro.getWindowInfo()` first, retain safe fallback.
- Modify: `mini-program/src/components/onboarding-header/index.tsx` — compose `AppNavbar` rather than own geometry.
- Modify: `mini-program/src/components/bottom-action-layout/index.tsx` — support `stacked` and a scroll-reserve class.
- Modify: `mini-program/src/styles/tokens.scss`, `layout.scss`, `page.scss` — canonical three-page tokens and scoped styles.
- Modify: `mini-program/src/pages/onboarding/index.tsx`, `body-profile/index.tsx`, `nutrition-plan/index.tsx` — hierarchy only; preserve store interactions and calculations.
- Modify: `mini-program/tests/onboarding-localization-layout.test.ts`, `four-page-stitch-contract.test.ts`, `ui-calibration-contract.test.ts` — executable source/metrics contracts.

### Task 1: Expand navigation metrics with tests first

**Files:**
- Modify: `mini-program/tests/onboarding-localization-layout.test.ts`
- Modify: `mini-program/src/utils/onboarding-navigation.ts`
- Modify: `mini-program/src/utils/use-menu-button-metrics.ts`

- [ ] **Step 1: Add the failing navigation metric contract**

```ts
expect(metrics.statusBarHeight).toBe(24);
expect(metrics.navigationBarHeight).toBe(44);
expect(metrics.totalHeaderHeight).toBe(68);
expect(metrics.titleMaxWidth).toBe(184);
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run test:unit -- onboarding-localization-layout.test.ts`

Expected: FAIL because the metrics fields do not exist.

- [ ] **Step 3: Implement the minimal metric shape**

```ts
const navigationBarHeight = Math.max(44, (menuButtonRect.top - statusBarHeight) * 2 + menuButtonRect.height);
return { statusBarHeight, navigationBarHeight, totalHeaderHeight: statusBarHeight + navigationBarHeight, rightInset, titleMaxWidth };
```

`useMenuButtonMetrics` must call `Taro.getWindowInfo()` and fall back to `getSystemInfoSync()` only when necessary.

- [ ] **Step 4: Verify green**

Run the Step 2 command. Expected: PASS.

### Task 2: Add reusable navigation and icon primitives

**Files:**
- Create: `mini-program/src/components/app-navbar/index.tsx`
- Create: `mini-program/src/components/nordic-icon/index.tsx`
- Modify: `mini-program/tests/ui-calibration-contract.test.ts`
- Modify: `mini-program/src/components/onboarding-header/index.tsx`

- [ ] **Step 1: Add failing source contracts**

```ts
expect(existsSync(source("src/components/app-navbar/index.tsx"))).toBe(true);
expect(read("src/components/app-navbar/index.tsx")).toContain("totalHeaderHeight");
expect(read("src/components/nordic-icon/index.tsx")).toContain("strokeWidth");
```

- [ ] **Step 2: Verify red**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run test:unit -- ui-calibration-contract.test.ts`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement the primitives**

`AppNavbar` accepts `{ title, step?, progress?, backAriaLabel, onBack, variant }`, aligns its back control to capsule center, assigns content top padding from `totalHeaderHeight`, and reserves `rightInset`. `NordicIcon` accepts a discriminated local icon name and renders Taro-compatible inline SVG/path markup with `strokeWidth={1.8}`. `OnboardingHeader` becomes a compatibility wrapper around `AppNavbar`.

- [ ] **Step 4: Verify green**

Run the Step 2 command. Expected: PASS.

### Task 3: Calibrate common tokens and safe bottom action layout

**Files:**
- Modify: `mini-program/src/styles/tokens.scss`
- Modify: `mini-program/src/styles/layout.scss`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/components/bottom-action-layout/index.tsx`
- Modify: `mini-program/tests/ui-calibration-contract.test.ts`

- [ ] **Step 1: Add failing token/layout assertions**

```ts
expect(tokens).toContain("$stitch-page-gutter: 20px;");
expect(tokens).toContain("$stitch-action-height: 54px;");
expect(read("src/styles/page.scss")).toContain("env(safe-area-inset-bottom)");
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run test:unit -- ui-calibration-contract.test.ts`

Expected: FAIL for missing canonical token names.

- [ ] **Step 3: Implement scoped Sass**

Add 20px gutter, 16px radius, 54px action, warm/white/beige surface, 24/15/16/13px text tiers, safe-action reserve, `button::after { border: 0; }`, and only `.onboarding-page`, `.body-profile-page`, `.nutrition-plan-page` selectors for affected visuals. `BottomActionLayout` renders a vertically stacked safe footer without covering scroll content.

- [ ] **Step 4: Verify green**

Run the Step 2 command. Expected: PASS.

### Task 4: Rebuild onboarding and body-profile shell

**Files:**
- Modify: `mini-program/src/pages/onboarding/index.tsx`
- Modify: `mini-program/src/pages/body-profile/index.tsx`
- Modify: `mini-program/tests/four-page-stitch-contract.test.ts`
- Modify: `mini-program/tests/stitch-onboarding-visual.test.ts`

- [ ] **Step 1: Add failing hierarchy assertions**

```ts
expect(onboarding).toContain('className="onboarding-page"');
expect(body).toContain('className="body-profile-page"');
expect(body).toContain("NordicIcon");
expect(onboarding).not.toContain('"✓"');
```

- [ ] **Step 2: Run red tests**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run test:unit -- four-page-stitch-contract.test.ts stitch-onboarding-visual.test.ts`

Expected: FAIL because the new namespaces/icon primitive are absent.

- [ ] **Step 3: Implement minimal page hierarchy**

Keep the existing goal map, translated copy, `setDraft`, validation, inputs, gender activity selection, and `Taro.navigateTo`. Add icon-ground wrappers and `NordicIcon`; render selected indicators with the icon primitive. Apply `AppNavbar` via `OnboardingHeader` and use 88–92px goal cards, consistent metric cards, 64–68px activity rows, and a custom gender segment.

- [ ] **Step 4: Verify green**

Run the Step 2 command. Expected: PASS.

### Task 5: Rebuild Nutrition Plan hierarchy

**Files:**
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/tests/four-page-stitch-contract.test.ts`

- [ ] **Step 1: Add failing plan hierarchy assertions**

```ts
expect(source).toContain("nutrition-plan__plan-ready");
expect(source).toContain("nutrition-plan__insight");
expect(source).toContain("nutrition-plan__targets-card");
expect(source).toContain("nutrition-plan__milestone-list");
expect(source).not.toContain('tone="dark"');
```

- [ ] **Step 2: Run red test**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run test:unit -- four-page-stitch-contract.test.ts`

Expected: FAIL because the old dark hero and split targets remain.

- [ ] **Step 3: Implement the new hierarchy**

Use `AppNavbar variant="nova"`; retain `calculateNutritionPlan(validation.profile)`. Render a white plan-ready card with `goalLabels[plan.goalType]`, a left-rule AI insight, one beige target card with calories and three `CircularProgress` instances, and a white two-row milestone list based on profile/goal values. Use `total={Math.max(plan.proteinG * 3, 1)}`, `total={Math.max(plan.carbsG * 2, 1)}`, and `total={Math.max(plan.fatG * 4, 1)}` so progress is dynamic and distinct. Move the two existing actions into `BottomActionLayout` in primary/outline vertical order.

- [ ] **Step 4: Verify green**

Run the Step 2 command. Expected: PASS.

### Task 6: Static, build, and device validation

**Files:**
- No source changes expected.

- [ ] **Step 1: Run full static suite**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run test:unit && pnpm --filter @nordic-nutri-ai/mini-program run typecheck && pnpm --filter @nordic-nutri-ai/mini-program run lint`

Expected: all commands exit 0.

- [ ] **Step 2: Build the actual WeChat artifact**

Run: `pnpm --filter @nordic-nutri-ai/mini-program run build:weapp && pnpm --filter @nordic-nutri-ai/mini-program run verify:weapp`

Expected: `mini-program/dist/weapp` refreshed and verification exits 0.

- [ ] **Step 3: Verify in WeChat Developer Tools**

Open/recompile the existing `mini-program/dist/weapp` project, clear file/data cache, and inspect onboarding, body-profile, nutrition-plan at iPhone 15 Pro Max, ordinary notched iPhone, Android full-screen, and narrow screen. Capture each page and record header/capsule clearance, footer clearance, selections, and navigation.

- [ ] **Step 4: Check source scope**

Run: `git status --short`

Expected: only the planned source/tests/styles/docs and generated ignored output changed. Do not create commits: this checkout has no initial commit and all existing files are user-owned untracked content.
