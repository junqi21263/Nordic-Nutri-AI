# Nordic Weekly 分享卡头尾微调 Implementation Plan

> **For agentic workers:** Execute this plan inline, one checkpoint at a time. Keep the changes scoped to the weekly share poster.

**Goal:** Improve the Nordic Weekly poster header spacing, use the existing Nordic project icon at the upper right, and remove the selected lower-right footer group.

**Architecture:** Keep the current Canvas poster and export flow. Load the bundled brand logo through the existing image loader, pass it to the poster painter, and draw it clipped in the current circular header medallion. Remove the footer tagline/mini-program-code drawing without changing share or save behavior.

**Tech Stack:** Taro React, Canvas 2D, Vitest, TypeScript, Capacitor Android.

---

### Task 1: Add weekly poster visual-contract regression checks

**Files:**
- Modify: `mini-program/tests/weekly-share.test.ts`
- Read: `mini-program/src/pages/weekly-review/weekly-share-poster.ts`

- [ ] **Step 1: Assert header spacing, brand-logo rendering, and removal of the lower-right footer group**

Read the poster painter source in the existing weekly share test and assert that the series label baseline is above the `Nordic Weekly` title, the poster receives and draws a brand-logo image in the header, and the footer no longer draws the English tagline or mini-program code.

- [ ] **Step 2: Run the focused test and confirm the new contract fails against the current implementation**

Run: `pnpm exec vitest run tests/weekly-share.test.ts`
Expected: the new poster visual-contract assertion fails because the current painter uses a hand-drawn leaf and paints the footer tagline/QR.

### Task 2: Update the Canvas poster composition

**Files:**
- Modify: `mini-program/src/pages/weekly-review/weekly-share-poster.ts`
- Modify: `mini-program/src/pages/weekly-review/weekly-share.tsx`

- [ ] **Step 1: Move the small series label upward to add visible room before the title**

Change only the series-label baseline from `64` to `50`; retain the title, date, hero illustration, and following layout positions.

- [ ] **Step 2: Load and draw the existing brand icon in the upper-right circle**

Import `../../assets/brand/nordic-nutri-logo.png`, load it through the current `loadImage` helper, pass it as the poster's brand-logo image, clip it to the existing 72px circle, and remove the hand-drawn leaf from that header location.

- [ ] **Step 3: Remove the lower-right footer tagline and mini-program-code mark**

Remove the `qrCodeImage` poster argument and its draw block; omit `MINDFUL EATING MADE GENTLE` from the footer. Keep the left Nordic brand name, `饮食记录`, and the Chinese tagline.

### Task 3: Verify and install the Android test build

**Files:**
- Test: `mini-program/tests/weekly-share.test.ts`
- Build: `mini-program` Android H5 output and Capacitor Android project

- [ ] **Step 1: Run focused weekly-share tests and TypeScript checks**

Run from `mini-program`: `pnpm exec vitest run tests/weekly-share.test.ts tests/milestone-share-preview.test.ts tests/weekly-review-layout.test.ts && pnpm typecheck`
Expected: all selected tests and TypeScript check pass.

- [ ] **Step 2: Build the Android H5 bundle with the confirmed test CDN root**

Run from the repository root: `TARO_APP_MILESTONE_ASSET_CDN=https://test-dev-d4gyxnn0b5dfa2c8a-1420560890.tcloudbaseapp.com pnpm --dir mini-program build:android`
Expected: Taro reports successful compilation; asset-size warnings, if any, are recorded but do not fail the build.

- [ ] **Step 3: Sync Capacitor, compile, and install on the attached Android device**

Run: `pnpm exec cap sync android`, `cd android && ./gradlew assembleDebug`, then `adb -s 192.168.1.25:33411 install -r android/app/build/outputs/apk/debug/app-debug.apk`.
Expected: Capacitor sync and Gradle succeed; ADB reports `Success`.
