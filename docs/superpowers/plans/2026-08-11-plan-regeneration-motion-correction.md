# Plan Regeneration Motion Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the regeneration route handoff with a Stitch-style, same-page transition that has no visible white screen and exposes the fixed result CTA at first paint.

**Architecture:** Extract the existing Plan Ready presentation from `nutrition-plan` into a reusable view that accepts the already-computed preview and existing save/back callbacks. `diet-preferences` owns the complete regeneration state machine and renders Preferences and Plan Ready as overlapping sibling views. The API result stays in the client-only regeneration store solely for the current flow; no result-page preview request runs.

**Tech Stack:** Taro 4, React 18, TypeScript, Zustand, SCSS/WXSS, Vitest.

---

## File structure

- Create `mini-program/src/components/plan-ready-view/index.tsx`: presentation-only result body and fixed action bar, receiving plan data and existing action callbacks.
- Modify `mini-program/src/pages/diet-preferences/index.tsx`: owns the processing/request/transition lifecycle and renders both views in one `PageLayout`.
- Modify `mini-program/src/pages/nutrition-plan/index.tsx`: retains initial-onboarding behavior and uses `PlanReadyView`; removes regeneration-route-specific loading logic.
- Modify `mini-program/src/features/onboarding/plan-regeneration-motion.ts`: exact state transitions and overlap timing constants.
- Modify `mini-program/src/stores/plan-regeneration-store.ts`: only guards lifecycle and retains in-flight preview; it never controls routing.
- Modify `mini-program/src/components/circular-progress/index.tsx` and `mini-program/src/hooks/useAnimatedProgress.ts`: restartable delayed arc draw.
- Modify `mini-program/src/styles/page.scss` and `mini-program/src/styles/layout.scss`: same-page layers, tight indicator, reveal sequence, fixed bar and scroll clearance.
- Create focused contracts in `mini-program/tests/plan-regeneration-same-page.test.ts` and update `mini-program/tests/plan-regeneration-motion.test.ts`.

### Task 1: Lock the no-route state-machine contract

**Files:**
- Modify: `mini-program/src/features/onboarding/plan-regeneration-motion.ts`
- Modify: `mini-program/src/stores/plan-regeneration-store.ts`
- Modify: `mini-program/tests/plan-regeneration-motion.test.ts`

- [ ] **Step 1: Write the failing lifecycle test.**

```ts
it("holds processing until the result view starts and rejects duplicate starts", () => {
  const store = usePlanRegenerationStore.getState();
  store.reset();
  expect(store.start()).toBe(true);
  expect(store.start()).toBe(false);
  store.succeed(preview);
  expect(usePlanRegenerationStore.getState().state).toBe("transitioning");
  expect(usePlanRegenerationStore.getState().state).not.toBe("idle");
  usePlanRegenerationStore.getState().markReady();
  expect(usePlanRegenerationStore.getState().state).toBe("ready");
});
```

- [ ] **Step 2: Run the focused test and confirm it fails only if the current transition contract differs.**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-motion.test.ts`

- [ ] **Step 3: Implement the minimal state contract.**

```ts
export const planReadyMotion = {
  minimumProcessingMs: 2000,
  preferencesExitMs: 240,
  resultEnterMs: 320,
  resultReadyMs: 320,
  macroRingDelaysMs: [60, 120, 180],
} as const;
```

Keep `start()` false in `processing` and `transitioning`; only `markReady()` may move a successful flow to `ready`. `fail()` clears preview and cannot enter `transitioning`.

- [ ] **Step 4: Re-run the focused test.**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the isolated contract.**

```bash
git add mini-program/src/features/onboarding/plan-regeneration-motion.ts mini-program/src/stores/plan-regeneration-store.ts mini-program/tests/plan-regeneration-motion.test.ts
git commit -m "fix: define regeneration transition lifecycle"
```

### Task 2: Extract a reusable Plan Ready view with a fixed action sibling

**Files:**
- Create: `mini-program/src/components/plan-ready-view/index.tsx`
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Create: `mini-program/tests/plan-ready-view.test.ts`

- [ ] **Step 1: Write a failing structure contract.**

```ts
expect(source).toContain('className="plan-ready-view__scroll"');
expect(source).toContain('className="plan-ready-view__fixed-actions"');
expect(source.indexOf("plan-ready-view__scroll")).toBeLessThan(source.indexOf("plan-ready-view__fixed-actions"));
expect(source).toContain("revealDelayMs={planReadyMotion.macroRingDelaysMs[index]}");
```

- [ ] **Step 2: Run the contract.**

Run: `pnpm -C mini-program exec vitest run tests/plan-ready-view.test.ts`
Expected: FAIL because the component does not exist.

- [ ] **Step 3: Extract the existing result markup without changing copy or business callbacks.**

```tsx
export function PlanReadyView({ plan, primaryLabel, isSaving, onSave, onAdjust, reveal }: PlanReadyViewProps) {
  return <View className={`plan-ready-view ${reveal ? "plan-ready-view--revealing" : ""}`}>
    <View className="plan-ready-view__scroll">{/* success, insight, targets, milestones */}</View>
    <View className="plan-ready-view__fixed-actions">
      <AppButton size="large" loading={isSaving} onClick={onSave}>{primaryLabel}</AppButton>
      <AppButton variant="outline" size="large" onClick={onAdjust}>调整计划参数</AppButton>
    </View>
  </View>;
}
```

`nutrition-plan` continues to build its normal preview for initial onboarding, then renders this component. The component accepts `reveal=false` outside settings regeneration and must not call a data API.

- [ ] **Step 4: Re-run the structure contract and the nutrition plan tests.**

Run: `pnpm -C mini-program exec vitest run tests/plan-ready-view.test.ts tests/plan-regeneration-motion.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the extraction.**

```bash
git add mini-program/src/components/plan-ready-view/index.tsx mini-program/src/pages/nutrition-plan/index.tsx mini-program/tests/plan-ready-view.test.ts
git commit -m "refactor: extract plan ready presentation"
```

### Task 3: Render both views on the Preferences page and remove visual navigation

**Files:**
- Modify: `mini-program/src/pages/diet-preferences/index.tsx`
- Modify: `mini-program/tests/plan-regeneration-motion.test.ts`
- Create: `mini-program/tests/plan-regeneration-same-page.test.ts`

- [ ] **Step 1: Write the failing same-page contract.**

```ts
expect(source).toContain("<PlanReadyView");
expect(source).not.toContain('regenerated=1');
expect(source).not.toContain('Taro.navigateTo({ url: "/pages/nutrition-plan/index?settings=1');
expect(source).toContain("Promise.all");
expect(source).toContain("plan-regeneration__preferences");
expect(source).toContain("plan-regeneration__result");
```

- [ ] **Step 2: Run it.**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-same-page.test.ts`
Expected: FAIL because the current implementation navigates after exit delay.

- [ ] **Step 3: Coordinate API and minimum visual cycle, then crossfade in place.**

```ts
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const [preview] = await Promise.all([
  previewProductNutritionPlan(payload),
  wait(planReadyMotion.minimumProcessingMs),
]);
completeRegeneration(preview);
setResultPlan(preview);
// CSS sees `transitioning`; result is now mounted before the old view exits.
setTimeout(markRegenerationReady, planReadyMotion.resultReadyMs);
```

Render Preferences in `plan-regeneration__preferences` for `idle | processing | transitioning`; render `PlanReadyView` in `plan-regeneration__result` for `transitioning | ready`. Pass the current save handlers and adjust callback to `PlanReadyView`. The button remains disabled until `transitioning`; never call `navigateTo` in settings regeneration. On error, show the existing feedback error then `reset()`.

- [ ] **Step 4: Re-run contracts.**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-motion.test.ts tests/plan-regeneration-same-page.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit the behavior.**

```bash
git add mini-program/src/pages/diet-preferences/index.tsx mini-program/tests/plan-regeneration-motion.test.ts mini-program/tests/plan-regeneration-same-page.test.ts
git commit -m "fix: crossfade regenerated plan in place"
```

### Task 4: Tune only the scoped Stitch motion and safe-area clearance

**Files:**
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/styles/layout.scss`
- Modify: `mini-program/src/hooks/useAnimatedProgress.ts`
- Modify: `mini-program/src/components/circular-progress/index.tsx`
- Modify: `mini-program/tests/plan-ready-view.test.ts`

- [ ] **Step 1: Write failing style and ring contracts.**

```ts
expect(styles).toContain(".plan-regeneration--transitioning .plan-regeneration__preferences");
expect(styles).toContain(".plan-regeneration--transitioning .plan-regeneration__result");
expect(styles).toContain("env(safe-area-inset-bottom)");
expect(styles).toContain("--plan-ready-fixed-actions-height");
expect(hook).toContain("clearTimeout(delayRef.current)");
```

- [ ] **Step 2: Run it.**

Run: `pnpm -C mini-program exec vitest run tests/plan-ready-view.test.ts`
Expected: FAIL until explicit same-page layer and clearance rules exist.

- [ ] **Step 3: Add the minimum visual rules.**

```scss
.plan-regeneration__preferences { opacity: 1; transform: translateY(0); }
.plan-regeneration__result { opacity: 0; pointer-events: none; transform: translateY(10px); }
.plan-regeneration--transitioning .plan-regeneration__preferences { opacity: 0; transform: translateY(-6px); }
.plan-regeneration--transitioning .plan-regeneration__result,
.plan-regeneration--ready .plan-regeneration__result { opacity: 1; pointer-events: auto; transform: translateY(0); }
.plan-ready-view__scroll { padding-bottom: calc(var(--plan-ready-fixed-actions-height) + env(safe-area-inset-bottom)); }
```

Keep the processing bars as three compact vertical bars with 4--8px label spacing. Keep the existing timer cleanup in the ring hook and add delay reset so every result reveal starts at zero arc.

- [ ] **Step 4: Run all focused tests and build checks.**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-motion.test.ts tests/plan-regeneration-same-page.test.ts tests/plan-ready-view.test.ts && pnpm -C mini-program lint && pnpm -C mini-program typecheck && pnpm -C mini-program build:weapp`
Expected: all commands exit 0.

- [ ] **Step 5: Inspect the generated mini-program artifact and commit.**

Run: `test -f mini-program/dist/weapp/app.json && git diff --check`

```bash
git add mini-program/src/styles/page.scss mini-program/src/styles/layout.scss mini-program/src/hooks/useAnimatedProgress.ts mini-program/src/components/circular-progress/index.tsx mini-program/tests/plan-ready-view.test.ts
git commit -m "fix: align plan ready motion and fixed actions"
```

## Final manual acceptance

1. In WeChat DevTools and a real iPhone/Android run, start settings-mode regeneration.
2. Confirm CTA immediately becomes disabled and `OPTIMIZING MACROS` remains visible until the result begins.
3. Confirm there is no user-perceivable white screen, the result appears continuously, rings draw in order, and the two CTA buttons are visible from the first result frame.
4. Scroll the result; fixed actions must not move and the final milestone must clear them.
