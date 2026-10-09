# Profile Entry and Icon Optimization Implementation Plan

> **For agentic workers:** Execute this plan task-by-task with focused verification. Preserve unrelated working-tree changes and do not stage or reset files outside this scope.

**Goal:** Reduce the visual competition among the profile-page entries and replace ambiguous repeated icons with a small, semantically distinct icon vocabulary that matches Nordic Nutri AI.

**Architecture:** Keep the existing `ListItem` and `NordicIcon` abstractions. Add semantic sections and two dedicated profile actions in the existing profile page, while using local SVG assets with the existing 24px forest-green stroke treatment. No API, storage, route, or data-model changes.

**Tech Stack:** Taro React, TypeScript, SCSS tokens, local SVG assets, Vitest.

---

### Task 1: Lock the profile information hierarchy with a failing regression test

**Files:**
- Create: `mini-program/tests/profile-entry-organization.test.ts`
- Inspect: `mini-program/src/pages/profile/index.tsx`
- Inspect: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Write the failing test**

Assert that the profile page has the three semantic groups (`饮食管理`, `帮助与信息`, `推荐好友`), isolates `退出登录`, and uses the new semantic icon names instead of `pencil`, `check`, and `x` for those rows.

- [ ] **Step 2: Run the focused test**

Run from `mini-program`: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec vitest run tests/profile-entry-organization.test.ts`.

Expected: FAIL because the current page has one settings group and the old icon names.

### Task 2: Add the smallest semantic icon set

**Files:**
- Create: `mini-program/src/assets/icons/bookmark.svg`
- Create: `mini-program/src/assets/icons/message-circle.svg`
- Create: `mini-program/src/assets/icons/shield-check.svg`
- Create: `mini-program/src/assets/icons/info.svg`
- Create: `mini-program/src/assets/icons/log-out.svg`
- Modify: `mini-program/src/components/nordic-icon/index.tsx`

- [ ] **Step 1: Add local SVGs**

Use the existing 24x24 outline format, forest-green `#153F2B`, rounded caps/joins, and 1.8px stroke. Keep the files static and do not add a runtime icon dependency.

- [ ] **Step 2: Register the names**

Add imports, union members, and `iconSources` entries in `NordicIcon`.

- [ ] **Step 3: Run the icon vocabulary checks**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec vitest run tests/icon-vocabulary.test.ts tests/profile-entry-organization.test.ts`.

Expected: the icon source compiles; the profile organization test still fails until Task 3.

### Task 3: Reorganize profile entries without changing routes

**Files:**
- Modify: `mini-program/src/pages/profile/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Create semantic section wrappers**

Keep existing click handlers and URLs. Render `我的常吃` and `营养档案` under `饮食管理`; render `反馈与帮助`, `关于我们`, and `隐私政策与免责声明` under `帮助与信息`; render `推荐好友` as a separate clickable share card; render `退出登录` as an isolated bottom action.

- [ ] **Step 2: Apply semantic icons**

Use `bookmark` for `我的常吃`, keep `ruler` for `营养档案`, use `message-circle` for feedback, `info` for about, `shield-check` for privacy, existing `share` for recommendation, and `log-out` for logout. Keep the unread bell behavior unchanged.

- [ ] **Step 3: Add hierarchy styles**

Reuse existing tokens. Section labels should be small secondary text; the first group may retain a surface container; the share card should use the existing soft-beige surface; logout should have no container and use the error color only for the icon/text. Preserve touch targets of at least 44px.

- [ ] **Step 4: Run the regression test**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec vitest run tests/profile-entry-organization.test.ts tests/icon-vocabulary.test.ts tests/meal-templates.test.ts`.

Expected: PASS with no route or icon-wrapper regressions.

### Task 4: Typecheck and build the Android DEV APK

**Files:**
- Verify only: `mini-program/src/pages/profile/index.tsx`, `mini-program/src/styles/page.scss`, `mini-program/src/components/nordic-icon/index.tsx`, new SVGs, and focused test.

- [ ] **Step 1: Run TypeScript and whitespace checks**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec tsc --noEmit` from `mini-program`, then `git diff --check` from the worktree root.

- [ ] **Step 2: Build web assets for Android**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH CAPACITOR_LIVE_RELOAD=false TARO_APP_API_BASE_URL=https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com pnpm --dir mini-program build:android`.

Expected: exit 0; existing webpack asset-size warnings may remain and are reported separately.

- [ ] **Step 3: Sync, assemble, and install**

Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm exec cap sync android`, `./android/gradlew -p android assembleDebug`, then `/opt/local/bin/adb -s 192.168.1.25:37613 install -r android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 4: Verify the target**

Confirm `/opt/local/bin/adb -s 192.168.1.25:37613 get-state` returns `device` and inspect the installed package update time. Report build/install evidence separately from the user's final visual device check.
