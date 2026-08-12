# Plan Regeneration Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reproduce the Stitch plan-regeneration motion from Dietary Preferences through the Plan Ready result while retaining the existing nutrition-plan API and target-save behavior.

**Architecture:** Add a small client-only regeneration-flow store that owns the explicit state machine and carries the successful preview result into the existing nutrition-plan route. Dietary Preferences starts the real preview request and displays the inline processing state for at least the Stitch 2s cycle; only a successful result may navigate to Nutrition Plan. Nutrition Plan consumes the carried result, reveals its existing content in staggered layers, animates its existing circular-progress arcs, and renders its two actions in a page-scoped fixed action bar.

**Tech Stack:** Taro 4, React 18, TypeScript, Zustand, SCSS/WXSS keyframes, Vitest.

---

## File structure

- Create `mini-program/src/features/onboarding/plan-regeneration-motion.ts`: timing constants and pure state-transition helpers.
- Create `mini-program/src/stores/plan-regeneration-store.ts`: client-only state machine, request identity, successful preview payload, and dev-only replay reset.
- Modify `mini-program/src/pages/diet-preferences/index.tsx`: run the real preview request, show the inline three-bar processing layer, gate duplicate presses, and navigate only after success plus the minimum motion cycle.
- Modify `mini-program/src/pages/nutrition-plan/index.tsx`: consume a carried preview when opened from settings regeneration; add scoped ready/reveal class names and a fixed action shell without changing save logic.
- Modify `mini-program/src/components/circular-progress/index.tsx`: accept an entrance delay passed to the existing arc-progress hook without rotating the component.
- Modify `mini-program/src/hooks/useAnimatedProgress.ts`: support an optional start delay and reset cleanly when reveal is replayed.
- Modify `mini-program/src/styles/page.scss`: add only plan-regeneration, nutrition-plan reveal, macro arc, and fixed-action CSS.
- Modify `mini-program/src/styles/layout.scss`: keep nutrition-plan scroll padding equal to the existing fixed action height plus safe area.
- Create/modify focused tests under `mini-program/tests/`.

### Task 1: Define the state machine and timing contract

**Files:**
- Create: `mini-program/src/features/onboarding/plan-regeneration-motion.ts`
- Test: `mini-program/tests/plan-regeneration-motion.test.ts`

- [ ] **Step 1: Write the failing state-machine and timing test**

```ts
import { describe, expect, it } from "vitest";
import {
  minimumPlanProcessingMs,
  planReadyMotion,
  nextPlanRegenerationState,
} from "../src/features/onboarding/plan-regeneration-motion";

describe("plan regeneration motion", () => {
  it("only reaches ready after a successful request and transition", () => {
    expect(nextPlanRegenerationState("idle", "start")).toBe("processing");
    expect(nextPlanRegenerationState("processing", "succeed")).toBe("transitioning");
    expect(nextPlanRegenerationState("transitioning", "transitionEnd")).toBe("ready");
    expect(nextPlanRegenerationState("processing", "fail")).toBe("error");
  });

  it("matches the Stitch processing and result reveal cadence", () => {
    expect(minimumPlanProcessingMs).toBe(2000);
    expect(planReadyMotion.exitDurationMs).toBe(600);
    expect(planReadyMotion.enterDurationMs).toBe(600);
    expect(planReadyMotion.macroRingDelaysMs).toEqual([100, 160, 220]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-motion.test.ts`

Expected: FAIL because `plan-regeneration-motion.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure state machine**

```ts
export type PlanRegenerationState = "idle" | "processing" | "transitioning" | "ready" | "error";
export type PlanRegenerationEvent = "start" | "succeed" | "fail" | "transitionEnd" | "reset";

export const minimumPlanProcessingMs = 2000;
export const planReadyMotion = {
  exitDurationMs: 600,
  enterDurationMs: 600,
  macroRingDelaysMs: [100, 160, 220],
} as const;

export function nextPlanRegenerationState(state: PlanRegenerationState, event: PlanRegenerationEvent): PlanRegenerationState {
  if (event === "reset") return "idle";
  if (state === "idle" && event === "start") return "processing";
  if (state === "processing" && event === "succeed") return "transitioning";
  if (state === "processing" && event === "fail") return "error";
  if (state === "transitioning" && event === "transitionEnd") return "ready";
  return state;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-motion.test.ts`

Expected: PASS.

### Task 2: Carry a successful preview through the route transition

**Files:**
- Create: `mini-program/src/stores/plan-regeneration-store.ts`
- Test: `mini-program/tests/plan-regeneration-store.test.ts`

- [ ] **Step 1: Write the failing store test**

```ts
import { describe, expect, it } from "vitest";
import { usePlanRegenerationStore } from "../src/stores/plan-regeneration-store";

describe("plan regeneration store", () => {
  it("rejects duplicate starts and never exposes a plan after failure", () => {
    const store = usePlanRegenerationStore.getState();
    store.reset();
    expect(store.start()).toBe(true);
    expect(usePlanRegenerationStore.getState().start()).toBe(false);
    usePlanRegenerationStore.getState().fail();
    expect(usePlanRegenerationStore.getState().state).toBe("error");
    expect(usePlanRegenerationStore.getState().preview).toBeNull();
  });
});
```

- [ ] **Step 2: Run the store test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-store.test.ts`

Expected: FAIL because `usePlanRegenerationStore` does not exist.

- [ ] **Step 3: Implement the client-only store**

Define a `PlanPreview` value using `calories`, `proteinG`, `carbsG`, `fatG`, `insight`, and `source`; `start()` transitions only from idle and returns a boolean; `succeed(preview)` retains the preview and enters transitioning; `fail()` clears preview and enters error; `markReady()` enters ready; `reset()` clears all state. Keep the Zustand store non-persistent so no stale plan result survives a relaunch.

- [ ] **Step 4: Run the store test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-store.test.ts`

Expected: PASS.

### Task 3: Add the inline Preferences processing flow

**Files:**
- Modify: `mini-program/src/pages/diet-preferences/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Test: `mini-program/tests/plan-regeneration-preferences.test.ts`

- [ ] **Step 1: Write the failing page contract test**

```ts
expect(source).toContain("usePlanRegenerationStore");
expect(source).toContain("previewProductNutritionPlan");
expect(source).toContain("minimumPlanProcessingMs");
expect(source).toContain("plan-regeneration__processing");
expect(source).toContain("OPTIMIZING MACROS");
expect(source).not.toContain("Taro.showLoading");
```

- [ ] **Step 2: Run the contract test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-preferences.test.ts`

Expected: FAIL because the page has no regeneration state, preview request, or inline processing layer.

- [ ] **Step 3: Implement request/motion coordination**

1. Extract the existing validated onboarding draft values into the exact `previewProductNutritionPlan` request payload already used by Nutrition Plan.
2. On settings-mode CTA press, call `start()`; record `startedAt`; start `previewProductNutritionPlan(payload)` immediately.
3. On success, wait `Math.max(0, minimumPlanProcessingMs - (Date.now() - startedAt))`, call `succeed(preview)`, then navigate to `/pages/nutrition-plan/index?settings=1&regenerated=1`.
4. On failure, call `fail()`, restore the CTA, and use the existing feedback store error path. Never navigate to Plan Ready after failure.
5. Render the existing preference content with a processing modifier and add a central three-bar `View` group plus `OPTIMIZING MACROS`. Keep the original content visible; disable the CTA while processing.

- [ ] **Step 4: Add Stitch-compatible SCSS**

Add page-scoped styles only:

```scss
.plan-regeneration__processing { opacity: 0; pointer-events: none; }
.plan-regeneration--processing .plan-regeneration__processing { opacity: 1; }
.plan-regeneration__bar { animation: plan-regeneration-bar 1.2s ease-in-out infinite alternate; }
.plan-regeneration__bar--2 { animation-delay: 75ms; }
.plan-regeneration__bar--3 { animation-delay: 150ms; }
.plan-regeneration__label { animation: plan-regeneration-pulse 1.5s cubic-bezier(.4,0,.6,1) infinite; }
```

Use transform scaleY for bar amplitude instead of animating layout height. The CTA active state remains a 120–160ms `scale(.975)` tactile response.

- [ ] **Step 5: Run the contract test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-preferences.test.ts`

Expected: PASS.

### Task 4: Consume the carried plan and reveal the result route

**Files:**
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Test: `mini-program/tests/plan-regeneration-ready.test.ts`

- [ ] **Step 1: Write the failing ready-route contract test**

```ts
expect(source).toContain("usePlanRegenerationStore");
expect(source).toContain("router.params.regenerated");
expect(source).toContain("nutrition-plan-page--ready");
expect(source).toContain("nutrition-plan__reveal--success");
expect(source).toContain("nutrition-plan__reveal--insight");
expect(source).toContain("nutrition-plan__reveal--targets");
```

- [ ] **Step 2: Run the ready-route test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-ready.test.ts`

Expected: FAIL because Nutrition Plan only fetches its own preview and has no regeneration reveal classes.

- [ ] **Step 3: Implement carried-preview consumption**

When `router.params.regenerated === "1"`, read the preview from `usePlanRegenerationStore`; use it as the initial `plan` and do not start a duplicate preview request. If there is no carried preview, retain the current page fetch/fallback behavior. After route mount, call `markReady()` after the 600ms entrance transition so dev replay and consumers have a correct final state.

Wrap only existing visual blocks in reveal classes in this order: success card, insight, daily-target section, milestone section. Use a page-scoped initial opacity/translateY(10px) and 500ms fade-up with 100ms, 200ms, 300ms, 360ms delays. Do not change copy, calculated numbers, or save handlers.

- [ ] **Step 4: Run the ready-route test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-ready.test.ts`

Expected: PASS.

### Task 5: Animate macro arcs with the Stitch stagger

**Files:**
- Modify: `mini-program/src/hooks/useAnimatedProgress.ts`
- Modify: `mini-program/src/components/circular-progress/index.tsx`
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Test: `mini-program/tests/plan-regeneration-rings.test.ts`

- [ ] **Step 1: Write the failing ring-delay test**

```ts
expect(source).toContain("revealDelayMs?: number");
expect(source).toContain("setTimeout");
expect(plan).toContain("revealDelayMs={planReadyMotion.macroRingDelaysMs[index]}");
expect(plan).toContain("revealDurationMs={1000}");
```

- [ ] **Step 2: Run the ring test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-rings.test.ts`

Expected: FAIL because CircularProgress starts every ring immediately and accepts no reveal delay.

- [ ] **Step 3: Add delayed arc reveal without changing the macro result**

Add `revealDelayMs?: number` to `CircularProgressProps` and pass it into `useAnimatedProgress`. Extend the hook with a timer that holds progress at 0 until the delay elapses, clears its timer on unmount/replay, then uses the existing easing to draw the arc. In Nutrition Plan, map macros with `index` and pass the three Stitch delay values only for regenerated ready mode. Keep `animateValue={false}` so percentages do not count from zero.

- [ ] **Step 4: Run the ring test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-rings.test.ts`

Expected: PASS.

### Task 6: Make the Plan Ready actions truly fixed and safe-area aware

**Files:**
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/styles/layout.scss`
- Test: `mini-program/tests/plan-regeneration-fixed-actions.test.ts`

- [ ] **Step 1: Write the failing fixed-action contract test**

```ts
expect(source).toContain("nutrition-plan__fixed-actions");
expect(styles).toContain("position: fixed;");
expect(styles).toContain("env(safe-area-inset-bottom)");
expect(layout).toContain("--nutrition-plan-fixed-actions-height");
expect(layout).toContain("padding-bottom");
```

- [ ] **Step 2: Run the fixed-action test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-fixed-actions.test.ts`

Expected: FAIL because `BottomActionLayout` currently stays in the page content flow.

- [ ] **Step 3: Implement a Nutrition Plan-scoped fixed action shell**

Move only the existing two buttons outside the plan content stack into a sibling `View` named `nutrition-plan__fixed-actions`; retain their current handlers and loading/disabled behavior. Add page-scoped CSS:

```scss
.nutrition-plan__fixed-actions {
  background: $stitch-page-bg;
  bottom: 0;
  box-sizing: border-box;
  left: 0;
  padding: 24px 24px calc(24px + env(safe-area-inset-bottom));
  position: fixed;
  right: 0;
  z-index: 12;
}
```

Set `--nutrition-plan-fixed-actions-height` on the Nutrition Plan layout and use it to add scroll/content bottom padding. Preserve the existing safe-area and Header implementation.

- [ ] **Step 4: Run the fixed-action test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-fixed-actions.test.ts`

Expected: PASS.

### Task 7: Add development replay and validate the full flow

**Files:**
- Modify: `mini-program/src/stores/plan-regeneration-store.ts`
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Test: `mini-program/tests/plan-regeneration-store.test.ts`

- [ ] **Step 1: Write the failing replay test**

```ts
it("resets a ready regeneration for development replay without persisting it", () => {
  usePlanRegenerationStore.getState().reset();
  usePlanRegenerationStore.getState().start();
  usePlanRegenerationStore.getState().succeed(preview);
  usePlanRegenerationStore.getState().markReady();
  usePlanRegenerationStore.getState().reset();
  expect(usePlanRegenerationStore.getState()).toMatchObject({ state: "idle", preview: null });
});
```

- [ ] **Step 2: Run the replay test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/plan-regeneration-store.test.ts`

Expected: FAIL until the store reset clears the ready payload.

- [ ] **Step 3: Expose a development-only replay call without production UI**

Keep `reset()` as the replay primitive. In development only, attach it to the existing page/module debug surface used by the project; do not render a replay button or expose it in production UI. Ensure route unmount clears stale transitioning state only after it is no longer needed by the result page.

- [ ] **Step 4: Run focused tests and quality gates**

Run:

```bash
pnpm -C mini-program exec vitest run \
  tests/plan-regeneration-motion.test.ts \
  tests/plan-regeneration-store.test.ts \
  tests/plan-regeneration-preferences.test.ts \
  tests/plan-regeneration-ready.test.ts \
  tests/plan-regeneration-rings.test.ts \
  tests/plan-regeneration-fixed-actions.test.ts
pnpm -C mini-program run typecheck
pnpm -C mini-program run lint
pnpm -C mini-program run build:weapp
```

Expected: all tests pass; TypeScript, ESLint, and WeApp build exit with code 0.

- [ ] **Step 5: Perform manual DevTools / device acceptance**

1. In settings mode, click `重新生成计划`; confirm one request, visible original preferences, three-bar processing, and disabled CTA.
2. Throttle or delay the request; confirm processing loops past 2s without navigation.
3. Force a request failure; confirm the original page remains and ready page never appears.
4. On success, confirm no white frame: old content exits, Plan Ready enters, then success/insight/targets/milestones reveal.
5. Confirm three arcs draw in Protein → Carbs → Fat order without whole-ring rotation.
6. Scroll to the final milestone on iPhone and Android; confirm it stays above both fixed buttons and the home indicator.
