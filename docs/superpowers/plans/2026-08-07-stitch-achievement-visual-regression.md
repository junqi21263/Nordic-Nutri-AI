# Stitch Achievement Visual Regression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将微信小程序成就解锁弹窗与 `/Users/lewis/Downloads/stitch_nordic_nutri/code.html` 的静态 UI、文案、时间线和左右弹道礼花逐项对齐。

**Architecture:** 保留全局 `AchievementUnlockModal` 的事件队列与关闭行为。将 CSS `View` 粒子替换为全屏 Canvas 2D 图层；Canvas 使用与 Stitch 完全相同的 80 粒子、两侧起点、角度、速度、阻尼、重力、旋转和底部淡出公式。弹窗 UI 使用 Stitch 的真实布局值与 CSS 时间线，动态进度条独立延迟到 T=1500ms。

**Tech Stack:** Taro + React + TypeScript、微信小程序 Canvas 2D、requestAnimationFrame fallback、SCSS、Vitest。

---

### Task 1: Lock the Stitch static contract with a failing test

**Files:**

- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`
- Modify: `mini-program/src/components/achievement-unlock-modal/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Write the failing static contract test**

Add assertions for the exact Stitch text and structure:

```ts
expect(modal).toContain("🎉 已解锁成就");
expect(modal).toContain("成功记录第一餐，开启你的营养记录旅程。");
expect(modal).toContain("继续记录");
expect(modal).toContain("查看成就");
expect(modal).toContain("achievement-unlock-overlay__progress");
expect(pageStyles).toContain("width: 5%");
expect(pageStyles).toContain("animation: achievement-unlock-card-in 600ms cubic-bezier(0.175, 0.885, 0.32, 1.275) 500ms both");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: FAIL because the current modal uses custom copy, has no progress block, and uses different actions.

- [ ] **Step 3: Implement the minimal static UI restoration**

Render the Stitch text, progress label/value and two full buttons. Use a `useDeferredProgress(5, 1500)` fill so the bar progresses from 0 to 5 after T=1500ms. Restore card layout to `width: calc(100% - 40px)`, `max-width: 448px`, `padding: 24px`, `border-radius: 24px`; use a 80px icon container and 32px SVG icon.

- [ ] **Step 4: Verify the contract test passes**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 2: Add a Canvas 2D Stitch particle engine with a failing contract test

**Files:**

- Create: `mini-program/src/components/achievement-confetti-canvas/index.tsx`
- Modify: `mini-program/src/components/achievement-unlock-modal/index.tsx`
- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Write the failing Canvas/physics contract test**

Assert the new component and source contain the Golden Reference constants:

```ts
expect(confetti).toContain("const particleCountPerSide = 40");
expect(confetti).toContain("const colors = [\"#0B3B24\", \"#bdeecc\", \"#e3e3de\", \"#F9F8F3\"]");
expect(confetti).toContain("const gravity = 0.5");
expect(confetti).toContain("const drag = 0.95");
expect(confetti).toContain("requestAnimationFrame");
expect(confetti).toContain('startX = side === "left" ? -20 : width + 20');
expect(modal).toContain("AchievementConfettiCanvas");
expect(modal).not.toContain("renderParticles");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: FAIL because the Canvas component does not exist.

- [ ] **Step 3: Implement the Canvas engine**

Create `AchievementConfettiCanvas` using Taro `Canvas type="2d"` and `Taro.createSelectorQuery().fields({ node: true, size: true })`. At T=300ms, create 40 left and 40 right particles. Advance every frame with:

```ts
particle.vx *= 0.95;
particle.vy += 0.5;
particle.x += particle.vx;
particle.y += particle.vy;
particle.rotation += particle.rotationSpeed;
if (particle.y > height - 100) particle.opacity -= 0.05;
```

Draw exactly the Stitch circle or leaf-like rectangle shapes using the four-source palette. Clear the entire canvas per frame, use device pixel ratio, and cancel the timer/frame on unmount.

- [ ] **Step 4: Mount the full-screen Canvas above the card**

Remove the old `burst` views and mount `<AchievementConfettiCanvas seed={...} />` after the card. Assign the Canvas `z-index: 3`, fixed full-screen bounds, pointer-events none, and no clipping.

- [ ] **Step 5: Verify the contract test passes**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 3: Align exact timing and visual layers

**Files:**

- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/components/achievement-unlock-modal/index.tsx`
- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`

- [ ] **Step 1: Add a failing timeline contract test**

Assert the source contains the reference timing:

```ts
expect(confetti).toContain("const confettiDelayMs = 300");
expect(pageStyles).toContain("translateY(20px) scale(0.9)");
expect(pageStyles).toContain("scale(1.02)");
expect(pageStyles).toContain("1200ms both");
expect(pageStyles).toContain("1300ms both");
expect(pageStyles).toContain("1400ms both");
expect(pageStyles).toContain("background: rgba(0, 0, 0, 0.4)");
expect(pageStyles).toContain("blur(12px)");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: FAIL because the current backdrop, pop values and staggered phases differ.

- [ ] **Step 3: Implement timing/layer parity**

Use the reference `popCard` values, a black 40% overlay and 12px blur. Do not animate the icon scale: Stitch only delays its glow. Fade text at 1200ms, progress at 1300ms and the actions group at 1400ms, each for 500ms ease-out. Keep Canvas active above card and behind no UI because Stitch `z-50` covers the card.

- [ ] **Step 4: Verify the contract test passes**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 4: Build, Golden Frame preparation and commit

**Files:**

- Modify: `docs/ACHIEVEMENT_ANIMATION_DIFF.md`
- Verify: `mini-program/dist/weapp/`

- [ ] **Step 1: Run complete automated verification**

Run:

```bash
pnpm --dir mini-program exec vitest run
pnpm --dir mini-program typecheck
pnpm --dir mini-program lint
pnpm --dir mini-program build:weapp
pnpm --dir mini-program verify:weapp
git diff --check
```

Expected: all tests, types, lint, build and WXSS checks pass.

- [ ] **Step 2: Update the visual-regression report**

Mark static UI and particle engine statuses according to implemented source. Leave only actual mini-program platform limits as remaining differences; do not call visual acceptance complete without a new WeChat recording.

- [ ] **Step 3: Capture Golden Frame acceptance evidence**

In WeChat Developer Tools import `mini-program/dist/weapp/`, trigger a new achievement, and record T=0/150/300/500/750/1000/1250/1500/2000/2500/3000ms. Compare each with the source timeline in `docs/STITCH_ANIMATION_SPEC.md`.

- [ ] **Step 4: Commit**

```bash
git add mini-program/src/components/achievement-confetti-canvas/index.tsx mini-program/src/components/achievement-unlock-modal/index.tsx mini-program/src/styles/page.scss mini-program/tests/achievement-unlock-overlay.test.ts docs/ACHIEVEMENT_ANIMATION_DIFF.md docs/superpowers/plans/2026-08-07-stitch-achievement-visual-regression.md
git commit -m "fix: match stitch achievement celebration"
```
