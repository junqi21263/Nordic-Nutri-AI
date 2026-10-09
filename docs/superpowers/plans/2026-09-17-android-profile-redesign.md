# Android Profile UI & Motion Implementation Plan

**Goal:** Apply the supplied Stitch profile design to the existing Android application without replacing business logic or changing other platforms.

**Architecture:** Android-only overview component and scoped styles, shared existing menus/modals/tab bar. Existing authenticated APIs supply all metrics; no API, authentication or database changes. The follow-up request authorizes a fresh Android build and device installation.

**Tech Stack:** Taro 4.2, React 18, TypeScript, CSS, existing SVG assets and Zustand.

## Audit and design decisions

- Source: `/Users/lewis/Downloads/stitch_nordic_nutri_ai_profile_redesign/code.html` and `screen.png`; one design version, no packaged fonts.
- Ivory #F9F8F4, forest #18352A, sage #E8EFE9, oat #EEE9DF, terracotta #BE8F74; 20px gutter, 12px card gaps, 16–24px radii. Use explicit Android CSS pixels (PX) to avoid Taro's shared doubled-design-pixel transform.
- Replace the old 2x2 metrics with asymmetric overview, seven-day journal, horizontally scrollable achievements and compact weekly review. Reuse the actual user avatar, never replace it with the sample sheep. Existing compatible SVG icons retain semantic identity.
- Real target and protein: daily-summary endpoint; weekly meals/score/dates: weekly-review; streak: milestone-journey; achievements: existing authenticated refresh/store. No fallback to fixture meals or fabricated +250 kcal. Unknown values use a dash; request failure exposes retry.
- Profile edit/account sync, reminders, frequent meals, nutrition profile, feedback/history/replies, about, privacy, invite, logout and all six tab destinations retain their handlers.
- New header uses NORDIC / MY SPACE; no unbound settings button. Header utility toggles page motion, with explicit accessible label. Native Android already handles top status inset.
- CSS first-entry sections 350ms/70ms stagger; per-metric count-up 760ms once after data; later values update directly. Hide/unmount cancels frames. Media-query reduced motion plus local switch. Protein uses CSS transform transition with honest zero.
- No external font/CDN dependency. System typography and existing icons are intentional visual differences.

## Execution checklist

- [x] Add and run profile motion regression tests (unknown/zero, date labels, cancellation, final value).
- [x] Add Android overview, scoped CSS and minimal motion logic; preserve existing non-Android JSX and shared overlays.
- [x] Connect Android data refresh without duplicate existing overview requests, guard stale responses, retain working menus and navigation.
- [x] Run focused unit tests, TypeScript and ESLint; build Android bundle, sync Capacitor, compile debug APK and install on connected device.
- [ ] Capture actual rendered local UI at mobile widths and inspect overflow, scroll, reduced motion and interactions. Browser automation was blocked by the tool usage limit; real-device visual/gesture acceptance remains unverified.
- [x] Report final files, differences, motion triggers, business mapping, quality gates and unverified device behavior. Profile has no backend code change, so CloudBase server redeploy is not needed; the APK is the delivery artifact.
