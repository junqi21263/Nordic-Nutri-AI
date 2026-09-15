# Android Welcome Transition and Safe Area Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the welcome-to-home white frame with a polished persistent overlay and keep the coach footer above Android system insets.

**Architecture:** A tiny Zustand store owns the cross-route transition flag, while an app-level overlay remains mounted during `reLaunch`/`switchTab`. Existing `useSystemLayout` metrics are moved to the `PageLayout` root so fixed descendants share one runtime safe-area source.

**Tech Stack:** Taro 4, React 18, Zustand, SCSS, Vitest, Capacitor Android.

---

### Task 1: Cross-route welcome transition

**Files:**
- Create: `mini-program/src/stores/app-transition-store.ts`
- Create: `mini-program/src/components/app-transition-overlay/index.tsx`
- Create: `mini-program/src/components/app-transition-overlay/index.scss`
- Modify: `mini-program/src/app.tsx`
- Modify: `mini-program/src/app.scss`
- Modify: `mini-program/src/pages/welcome/index.tsx`
- Modify: `mini-program/src/pages/home/index.tsx`
- Test: `mini-program/tests/android-welcome-transition.test.ts`

- [ ] Add a failing source-contract test asserting an app-level overlay, welcome-side activation, home-side dismissal, and reduced-motion styling.
- [ ] Run `pnpm exec vitest run tests/android-welcome-transition.test.ts` and confirm failure.
- [ ] Add `useAppTransitionStore` with `showWelcomeTransition` and `hideWelcomeTransition`; render `AppTransitionOverlay` under `AppLayout`.
- [ ] Activate the overlay before Android authentication/navigation, dismiss it after Home `useDidShow` paints, and dismiss it on authentication failure.
- [ ] Implement the warm-white veil, restrained halo/ring motion, brand lockup, and reduced-motion fallback using CSS only.
- [ ] Run the focused test and confirm pass.

### Task 2: Runtime Android bottom inset

**Files:**
- Modify: `mini-program/src/components/app-safe-area/index.tsx`
- Modify: `mini-program/src/layouts/page-layout/index.tsx`
- Modify: `mini-program/src/styles/components.scss`
- Modify: `mini-program/src/styles/layout.scss`
- Modify: `mini-program/src/pages/coach/components/CoachComposer/index.scss`
- Test: `mini-program/tests/android-system-layout.test.ts`

- [ ] Add a failing test asserting that runtime `--app-safe-bottom` and `--app-tab-bar-height` reach the page root and fixed footer rules.
- [ ] Run `pnpm exec vitest run tests/android-system-layout.test.ts` and confirm failure.
- [ ] Let `AppSafeArea` accept a style prop, move layout CSS variables to the root, and calculate fixed tab/composer/content offsets from those variables with safe fallbacks.
- [ ] Run the focused test and confirm pass.

### Task 3: Build and device acceptance

**Files:**
- Build output: `artifacts/nordic-nutri-dev-20260910-<time>.apk`

- [ ] Run focused Vitest tests and `pnpm exec tsc --noEmit`; expect zero failures.
- [ ] Run `pnpm --dir mini-program run build:android`, `pnpm exec cap sync android`, and `android/gradlew assembleDebug`; expect successful builds (size warnings are non-blocking).
- [ ] Install with `adb -s 254ef605 install -r <apk>` and reproduce welcome-to-home plus coach footer on the connected device.
- [ ] Capture screenshots, visually verify no white intermediate frame and no clipped bottom labels, then provide the APK path and SHA-256.
