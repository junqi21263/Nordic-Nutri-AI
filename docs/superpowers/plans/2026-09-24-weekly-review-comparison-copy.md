# Weekly Review Comparison Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace raw signed weekly comparison values with clear directional Chinese copy.

**Architecture:** Keep the API and backend deltas unchanged. Add one pure presentation formatter used by the weekly review page and cover its positive, negative, and zero cases in the existing Vitest suite.

**Tech Stack:** Taro, React, TypeScript, Vitest.

---

### Task 1: Format weekly comparison deltas for people

**Files:**
- Create: `mini-program/src/pages/weekly-review/comparison-copy.ts`
- Modify: `mini-program/src/pages/weekly-review/index.tsx`
- Test: `mini-program/tests/weekly-review-layout.test.ts`

- [ ] **Step 1: Add a failing formatter test** for negative, positive, and zero day/meal deltas; assert rendered copy contains no signed raw numbers.
- [ ] **Step 2: Run the focused test** with `pnpm --dir mini-program test:unit -- weekly-review-layout.test.ts` and confirm it fails because the formatter is missing.
- [ ] **Step 3: Implement the smallest pure formatter** that emits explicit “多记录 N 天/餐”, “少记录 N 天/餐”, or “持平” language without changing values.
- [ ] **Step 4: Render the formatter output** where `index.tsx` currently interpolates signed deltas.
- [ ] **Step 5: Run focused verification** with `pnpm --dir mini-program test:unit -- weekly-review-layout.test.ts`, `pnpm typecheck:mini-program`, and `git diff --check`.
