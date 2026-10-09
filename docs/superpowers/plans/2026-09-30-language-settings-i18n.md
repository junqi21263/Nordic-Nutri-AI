# Language Settings and Remaining i18n Plan

> **Execution:** Implement inline in the approved feature worktree with a verification checkpoint after each task. Follow test-driven development: add focused failing assertions, run them, implement the smallest change, then rerun.

**Goal:** Replace the profile language Bottom Sheet with the approved dedicated language settings page, localize achievement preview titles in both profile layouts, and use a proper language icon.

**Architecture:** Keep the current Taro/React/i18next setup. The profile entry navigates to one registered page. That page holds `LanguagePreference` as draft state, persists through existing `setLanguagePreference` only on Apply, and performs existing Android reminder / authenticated push locale sync after a changed preference. Known achievement titles reuse `getAchievementTranslationSlug` and existing `achievements.items.<slug>.title` locale data; unknown server titles remain a safe fallback.

**Scope:** Only client UI/resources/tests. No API, database, migration, deployment, Android build, or install changes.

### Task 1: Lock the approved behavior with focused tests

**Files:** `mini-program/tests/i18n-page-coverage.test.ts`, new `mini-program/tests/language-settings-page.test.ts`.

- Assert the new page route exists and the profile language entry opens it with a language icon.
- Assert draft selection does not call persistence, Apply persists and navigates back, Reset selects `system`, and reminder/push sync is retained on apply.
- Assert both profile layouts translate achievement title via the existing catalog key with API-title fallback.
- Assert required semantic language-page resources exist in `en`, `zh-CN`, and `zh-TW`.
- Run `pnpm --dir mini-program exec vitest run tests/language-settings-page.test.ts tests/i18n-page-coverage.test.ts`; confirm new behavior assertions fail before implementation.

### Task 2: Add the dedicated language settings page

**Files:** `mini-program/src/app.config.ts`, `mini-program/src/components/language-settings/index.tsx`, new `mini-program/src/pages/language-settings/index.tsx`, new `mini-program/src/pages/language-settings/index.scss`, `mini-program/src/components/nordic-icon/index.tsx`, new `mini-program/src/assets/icons/languages.svg`.

- Add the page route and replace the existing Bottom Sheet entry with navigation to it.
- Add a compact outlined language icon to `NordicIcon` and use it on the profile row.
- Build a safe-area-aware page matching the supplied design: custom back/reset header, editorial introduction, grouped four-choice selector, explanatory note, and bottom Apply action.
- Keep changes as draft until Apply; Back discards; Reset changes the draft to system.
- On changed Apply, persist/switch locale and preserve existing reminder refresh and authenticated push schedule locale synchronization; show localized failure feedback.
- Keep narrow widths and long English text flexible (no fixed-width labels or clipping).
- Re-run Task 1 focused tests as the checkpoint.

### Task 3: Localize achievement previews and scan for visible leftovers

**Files:** `mini-program/src/pages/profile/index.tsx`, `mini-program/src/pages/profile/android-overview.tsx`, `mini-program/src/i18n/locales/en.json`, `mini-program/src/i18n/locales/zh-CN.json`, `mini-program/src/i18n/locales/zh-TW.json`.

- Resolve preview title and accessibility label from existing semantic achievement resources in both layouts.
- Preserve source title when the API introduces an unknown achievement.
- Add matching semantic keys for the dedicated page in all three locales; do not translate user data, internal parser strings, or API enum values.
- Re-scan currently i18n-enabled screens for direct visible copy omissions and fix only confirmed user-facing misses in this page/profile scope; report other classified domain/internal strings rather than broad-rewriting them.
- Run the focused language, achievement, and page-coverage tests.

### Task 4: Verify and report

- Run `pnpm --dir mini-program exec vitest run tests/language-settings-page.test.ts tests/i18n-page-coverage.test.ts tests/achievement-detail.test.ts tests/coach-profile.test.ts`.
- Run `pnpm --dir mini-program typecheck`.
- Check three locale JSON files parse and have parity for the new page keys; run formatter check on changed source files if the repository supports targeted Prettier invocation.
- Inspect the final diff limited to task-owned files and report tests, implementation, and any visual/device acceptance that remains unverified. Do not claim runtime visual acceptance without launching the page on a device.
