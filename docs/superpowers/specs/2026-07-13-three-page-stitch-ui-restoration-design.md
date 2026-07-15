# Three-page Stitch UI restoration design

## Scope

Rebuild only the WeChat Mini Program onboarding, body-profile, and nutrition-plan pages. Preserve Chinese copy, local Zustand draft state, validation, navigation, and calculated nutrition values. Do not alter Home, Scan, Records, Coach, Profile, backend resources, or generated `mini-program/dist/weapp` files.

## Purpose

The existing first-use flow is functional but its layout is compressed and structurally different from the supplied Nordic Wellness AI Stitch reference. The restoration makes the first-use journey feel like a calm, Scandinavian nutrition journal while preserving the existing product behavior.

## Reference and design direction

The sole visual reference is `/Users/lewis/Downloads/stitch_ai_nutrition_design_system/`. Its three HTML files define the required information hierarchy. The exported `screen.png` files contain the literal text `<FIFE Image failed to fetch>`, so pixel-overlay comparison against the supplied raster exports is unavailable.

The visual direction is **Modern Scandinavian Minimalism**: a warm-paper background, restrained forest-green actions, soft beige surfaces, generous whitespace, rounded tactile cards, and a journal-like hierarchy rather than dashboard density.

### Tokens

| Token | Value | Use |
| --- | --- | --- |
| page background | `#faf9f6` | all three pages and navigation |
| primary | `#163422` | selection, primary action, progress |
| text | `#1a1c1a` | headings and values |
| secondary text | `#424843` | descriptions and labels |
| beige surface | `#e8e2d8` / `#f2ebe1` | metrics and daily-target card |
| white surface | `#ffffff` | elevated, selectable cards |
| outline | `#c2c8c0` | neutral controls and dividers |
| page gutter | `20px` | content and footer alignment |
| card radius | `16px` | cards and input surfaces |
| action height | `54px` | primary and secondary actions |

Typography uses `PingFang SC`, followed by the platform system stack. This intentionally differs from the Stitch document's Inter-first declaration: the mini program has no licensed, bundled Inter file and must not depend on a remote web font.

### Shared navigation and safe areas

A reusable `AppNavbar` component will calculate its geometry from `Taro.getWindowInfo()` and `Taro.getMenuButtonBoundingClientRect()` when running in WeChat. It will expose total header height, status bar height, capsule-safe title width, and a fallback for H5/unit tests. Page content begins after the calculated height. The bottom action container uses `env(safe-area-inset-bottom)` plus a minimum padding, while scroll content reserves the full action height so no option is hidden.

## Page architecture

### Onboarding

- Shared navigation with back control, brand, step label, and 25% progress.
- A 24px title and 15px description separated from the progress bar by a deliberate 36px visual gap.
- Four 88–92px white goal cards with 44px neutral circular icon grounds, stable Chinese copy, and a green selected ring/check state.
- A full-width pill action in a safe-area-aware footer.

### Body Profile

- Same navigation geometry and step/progress treatment as onboarding.
- One full-width age metric and equal height/spacing height and weight cards.
- A custom two-way gender segment, not native radio styling.
- Four activity rows with consistent icon ground, title/description hierarchy, and selection indicator.
- Scroll content has enough bottom inset that the high-activity row remains visible above the footer action.

### Nutrition Plan

- Compact shared navigation with only the NOVA AI mark/title.
- White Plan Ready card with an icon and dynamic goal label; it contains neither calories nor a completion ring.
- Low-emphasis AI Insight card with a primary left rule and dynamic recommendation text.
- One warm Daily Targets card: dynamic calories above a divider and three equal macro rings below it. Ring percentages are derived from existing plan values and remain distinct rather than hard-coded to 100%.
- White Phase 1 milestone list that derives its values from existing goal/body-plan data.
- Full-width primary then outlined secondary action, vertically stacked in a safe-area footer.

## Icon approach

Use a single local SVG icon set with consistent 20px viewport and 1.75–2px stroke. Replace emoji, character icons, and disparate generated icon forms in the affected pages. No online icon font or remote asset is introduced.

## Validation plan

1. Add/adjust unit-level contracts before component changes; watch each new test fail before implementation.
2. Run existing mini-program unit tests, typecheck, lint, and WeChat build.
3. Import the built `mini-program/dist/weapp` output in WeChat Developer Tools.
4. Verify the three pages on iPhone 15 Pro Max, an ordinary notched iPhone, an Android full-screen device, and a narrow screen. Confirm header/capsule clearance, safe footer clearance, no horizontal overflow, copy preservation, and working selections/navigation.
5. Capture simulator screenshots. A true pixel overlay remains blocked until valid Stitch raster exports are supplied.

## Out of scope

- Backend/API or CloudBase changes.
- Fonts that require downloading or licensing.
- Changes outside the three requested pages, other than shared navigation, tokens, safe-area, and icon primitives required by them.
