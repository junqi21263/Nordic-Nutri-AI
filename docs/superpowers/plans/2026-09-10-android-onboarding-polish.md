# Android onboarding polish

> Execution: executing-plans, in the existing Android-dev worktree; no commits, remote deployment or production changes.

**Goal:** Apply the user-approved success centering, readable buttons, dietary icons/grid, and truthful generation animation.

**Architecture:** Reuse AppButton and NordicIcon. Android uses a CSS looping indicator instead of the mini-program Canvas node API; completion remains driven by the preview response. Keep existing timeout and nutrition calculation semantics.

**Tech Stack:** Taro/React, SCSS, Capacitor Android, Vitest.

- [ ] Add failing regression contracts in `mini-program/tests/android-onboarding-polish.test.ts`; run `pnpm exec vitest run tests/android-onboarding-polish.test.ts` from mini-program.
- [ ] In android-auth/index.scss, center success with `min-height: calc(100dvh - 152PX)` and flex alignment.
- [ ] In components.scss, give `.app-button.app-button--primary` white text, outline/secondary/ghost deep green, disabled gray, descendants inherited color. Preserve disabled behavior.
- [ ] In diet-preferences-config.ts reuse typed NordicIconName mappings; in diet-preferences/index.tsx render trailing icons. Change tag-list to three equal grid columns without selected-state resizing.
- [ ] In plan-transition-overlay use Android CSS spinner and explicit waiting label until completion. Respect reduced motion. Remove Android-only artificial pre-request acknowledgement and minimum display delay; keep mini-program animation unchanged. Log only preview duration/status, never profile/token.
- [ ] Inspect backend preview chain and report the identified serial model dependency; do not claim measured remote latency without runtime evidence or deploy changes without environment authority.
- [ ] Run focused Vitest tests and typecheck, Android H5 build, Capacitor sync, Gradle assembleDebug, ADB install -r on the verified device. Report device visual verification separately.
