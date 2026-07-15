# Food Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Mini Program food scanner as a safe-area-aware camera-style entry with local Lucide controls and a visible local-analysis scan transition.

**Architecture:** Keep `ScannerStore` as the source for flash/gallery/candidate behavior. Add local SVG assets through `NordicIcon`, make page-local React state represent the transient scan status, and style the scanner through scoped `food-scanner-page` classes.

**Tech Stack:** Taro React, TypeScript, Zustand, SCSS, Vitest, local Lucide SVG assets.

---

### Task 1: Define scanner page visual contract

**Files:**
- Modify: `mini-program/tests/four-page-stitch-contract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(source).toContain('className="food-scanner-page"');
expect(source).toContain('isScanning');
expect(source).toContain('scanner-frame--scanning');
expect(source).toContain('name="camera"');
expect(source).toContain('name="images"');
expect(source).not.toContain('▦');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit -- tests/four-page-stitch-contract.test.ts`

Expected: FAIL because the page has no scan state or camera/gallery icon names.

- [ ] **Step 3: Implement the page contract**

Replace character controls with `NordicIcon`, add `isScanning` state, and apply the scanning class while the transition is active.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit -- tests/four-page-stitch-contract.test.ts`

Expected: PASS.

### Task 2: Add local camera control icon assets

**Files:**
- Create: `mini-program/src/assets/icons/camera.svg`
- Create: `mini-program/src/assets/icons/images.svg`
- Create: `mini-program/src/assets/icons/zap.svg`
- Create: `mini-program/src/assets/icons/timer.svg`
- Create: `mini-program/src/assets/icons/switch-camera.svg`
- Create: `mini-program/src/assets/icons/utensils.svg`
- Modify: `mini-program/src/components/nordic-icon/index.tsx`

- [ ] **Step 1: Add SVGs with shared stroke rules**

Each SVG uses `viewBox="0 0 24 24"`, `fill="none"`, `stroke="#153F2B"`, `stroke-width="1.8"`, and the matching `data-lucide` icon name.

- [ ] **Step 2: Register each icon name**

Add each imported SVG to `NordicIconName` and `iconSources` so every scanner visual control is a local resource.

- [ ] **Step 3: Verify assets resolve**

Run: `pnpm --filter @nordic-nutri-ai/mini-program typecheck`

Expected: PASS.

### Task 3: Implement the scan transition and visual hierarchy

**Files:**
- Modify: `mini-program/src/pages/food-scanner/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/styles/layout.scss`

- [ ] **Step 1: Keep capture semantics and create a delayed transition**

Use `useState(false)` for `isScanning`; on capture choose the existing local fixture, set analysis, set scanning true, and navigate to `/pages/analysis-result/index` after 900ms. Clear the timeout on unmount.

- [ ] **Step 2: Create the camera-style UI**

Render scan-frame corners, local meal icon/preview, control icons, and a scan status overlay. Disable scanning controls while `isScanning` is true.

- [ ] **Step 3: Add scoped animation**

Define `.scanner-frame__scan-line` with a `@keyframes scanner-sweep` vertical transform, and honour `prefers-reduced-motion` by removing the animation while retaining status visibility.

- [ ] **Step 4: Build and validate**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit && pnpm --filter @nordic-nutri-ai/mini-program typecheck && pnpm --filter @nordic-nutri-ai/mini-program build:weapp && pnpm --filter @nordic-nutri-ai/mini-program verify:weapp`

Expected: unit tests, TypeScript, WeChat build, and WXSS compatibility all pass.
