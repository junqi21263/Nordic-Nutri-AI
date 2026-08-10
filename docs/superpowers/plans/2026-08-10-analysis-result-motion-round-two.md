# Analysis Result Motion Round Two Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reveal the existing scan analysis result progressively while preserving its final visual layout and all interaction behavior.

**Architecture:** The existing scanner-result transition will use one declarative timeline and named phases. The page will only attach transient data attributes/classes; CSS controls visibility and position without changing layout, while existing animated progress/count-up primitives receive phase-driven real values.

**Tech Stack:** Taro, React, TypeScript, Vitest, Sass, WeChat Mini Program.

---

### Task 1: Define and test the round-two timeline

**Files:**
- Modify: `mini-program/src/features/scanner/meal-recognition-motion.ts`
- Create: `mini-program/src/features/scanner/meal-recognition-motion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getMealRecognitionMotionSchedule, mealRecognitionMotionConfig } from "./meal-recognition-motion";

describe("meal recognition motion", () => {
  it("orders the frozen result UI from base to actions", () => {
    expect(mealRecognitionMotionConfig.baseRevealAtMs).toBe(0);
    expect(mealRecognitionMotionConfig.nutritionRevealAtMs).toBeGreaterThan(0);
    expect(mealRecognitionMotionConfig.metricsCountAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.nutritionRevealAtMs,
    );
    expect(mealRecognitionMotionConfig.contentRevealAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.metricsCountAtMs,
    );
    expect(mealRecognitionMotionConfig.bottomActionRevealAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.contentRevealAtMs,
    );
  });

  it("stages ingredient and macro rows without hard-coded item count", () => {
    const schedule = getMealRecognitionMotionSchedule(2);
    expect(schedule.ingredientDelaysMs).toEqual([0, mealRecognitionMotionConfig.contentStaggerMs]);
    expect(schedule.macroDelaysMs).toEqual([0, mealRecognitionMotionConfig.macroStaggerMs, mealRecognitionMotionConfig.macroStaggerMs * 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir mini-program test:unit src/features/scanner/meal-recognition-motion.test.ts`

Expected: FAIL because the new round-two timeline fields do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export const mealRecognitionMotionConfig = {
  baseRevealAtMs: 0,
  nutritionRevealAtMs: 250,
  metricsCountAtMs: 600,
  contentRevealAtMs: 1400,
  bottomActionRevealAtMs: 2200,
  completeAtMs: 2600,
  contentStaggerMs: 80,
  macroStaggerMs: 80,
  countDurationMs: 700,
  easing: "cubic-bezier(.22, 1, .36, 1)",
} as const;

export function getMealRecognitionMotionSchedule(itemCount: number) {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  return {
    ingredientDelaysMs: Array.from({ length: safeItemCount }, (_, index) => index * mealRecognitionMotionConfig.contentStaggerMs),
    macroDelaysMs: Array.from({ length: 3 }, (_, index) => index * mealRecognitionMotionConfig.macroStaggerMs),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir mini-program test:unit src/features/scanner/meal-recognition-motion.test.ts`

Expected: PASS.

### Task 2: Drive named phases and preserve replay without API traffic

**Files:**
- Modify: `mini-program/src/hooks/useMealRecognitionMotion.ts`
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Test: `mini-program/src/features/scanner/meal-recognition-motion.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it("exposes every named reveal phase in chronological order", () => {
  expect(getMealRecognitionMotionPhaseSchedule().map((entry) => entry.phase)).toEqual([
    "baseReveal",
    "nutritionReveal",
    "metricsCount",
    "contentReveal",
    "bottomActionReveal",
    "complete",
  ]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir mini-program test:unit src/features/scanner/meal-recognition-motion.test.ts`

Expected: FAIL because the schedule export and named phases do not exist.

- [ ] **Step 3: Write minimal implementation**

```ts
export type MealRecognitionMotionPhase =
  | "idle"
  | "baseReveal"
  | "nutritionReveal"
  | "metricsCount"
  | "contentReveal"
  | "bottomActionReveal"
  | "complete";

export const getMealRecognitionMotionPhaseSchedule = () => [
  { atMs: mealRecognitionMotionConfig.baseRevealAtMs, phase: "baseReveal" as const },
  { atMs: mealRecognitionMotionConfig.nutritionRevealAtMs, phase: "nutritionReveal" as const },
  { atMs: mealRecognitionMotionConfig.metricsCountAtMs, phase: "metricsCount" as const },
  { atMs: mealRecognitionMotionConfig.contentRevealAtMs, phase: "contentReveal" as const },
  { atMs: mealRecognitionMotionConfig.bottomActionRevealAtMs, phase: "bottomActionReveal" as const },
  { atMs: mealRecognitionMotionConfig.completeAtMs, phase: "complete" as const },
];
```

Use the schedule in the hook. Keep the existing `replayKey`; remove the visible development replay label so debug replay does not modify production or final page UI.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir mini-program test:unit src/features/scanner/meal-recognition-motion.test.ts`

Expected: PASS.

### Task 3: Apply phase-only reveal and dynamic metrics to the current page

**Files:**
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/components/circular-progress/index.tsx`
- Modify: `mini-program/src/components/macro-progress/index.tsx`

- [ ] **Step 1: Add page-level phase attributes only**

Attach `data-motion-phase` to the existing root. Add no cards, wrappers that affect layout, labels, or new visible controls. Mark existing page nodes as base, nutrition, content, or bottom targets only with classes/data attributes.

- [ ] **Step 2: Animate actual metric values**

Use existing `useCountUp` for kcal and macros. Start it at `metricsCount`; use actual `adjusted` values. Pass the same phase to `CircularProgress` and `MacroProgress` so rings/bars animate from zero and end at their existing real values.

- [ ] **Step 3: Add motion-only Sass selectors**

```scss
.analysis-result-page[data-recognition-reveal="true"] .analysis-result-page__motion-base {
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 260ms cubic-bezier(.22, 1, .36, 1), transform 260ms cubic-bezier(.22, 1, .36, 1);
}
.analysis-result-page[data-motion-phase="baseReveal"] .analysis-result-page__motion-base,
.analysis-result-page[data-motion-phase="nutritionReveal"] .analysis-result-page__motion-base,
.analysis-result-page[data-motion-phase="metricsCount"] .analysis-result-page__motion-base,
.analysis-result-page[data-motion-phase="contentReveal"] .analysis-result-page__motion-base,
.analysis-result-page[data-motion-phase="bottomActionReveal"] .analysis-result-page__motion-base {
  opacity: 1;
  transform: translateY(0);
}
```

Use analogous selectors for nutrition (`12px`, 340ms), content list items (`6px`, staggered inline delay), and bottom content/actions (`24px`, 340ms). Add the same final-state override to reduced-motion mode. Do not change any dimensions, color, typography, button declaration, spacing, border, or interaction handler.

- [ ] **Step 4: Verify final static styles are unchanged**

Run: `pnpm --dir mini-program typecheck && pnpm --dir mini-program lint && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp`

Expected: all commands pass; after `complete`, only opacity/transform transitions have been removed from the initial state and every existing element returns to its current static style.

### Task 4: Document and review

**Files:**
- Create: `MOTION_REVEAL_IMPLEMENTATION_REPORT.md`

- [ ] **Step 1: Write implementation report**

Document files, exact timeline, phase triggers, count-up, bars/ring, bottom reveal, replay mechanism, and remaining Stitch differences.

- [ ] **Step 2: Run complete validation**

Run: `pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program lint && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp`

Expected: all pass.

- [ ] **Step 3: Review CloudBase-adjacent mini-program changes**

Read applicable CloudBase code review rules; confirm the change has no auth, database, storage, or SDK API change.

- [ ] **Step 4: Commit only intended files**

```bash
git add mini-program/src/features/scanner/meal-recognition-motion.ts mini-program/src/features/scanner/meal-recognition-motion.test.ts mini-program/src/hooks/useMealRecognitionMotion.ts mini-program/src/pages/analysis-result/index.tsx mini-program/src/styles/page.scss MOTION_REVEAL_IMPLEMENTATION_REPORT.md docs/superpowers/plans/2026-08-10-analysis-result-motion-round-two.md
git commit -m "feat: refine scan result reveal sequence"
```
