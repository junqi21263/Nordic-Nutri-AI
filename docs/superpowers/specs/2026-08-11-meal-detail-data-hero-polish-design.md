# Meal Detail Data Hero Polish Design

## Goal

Polish only the no-image Nutrition Data Hero in Meal Detail so nutrition data is the intentional premium wellness focal point.

## Scope

- Keep the centered calorie hierarchy and shared rating footer.
- Replace macro dividers with three whitespace-separated data points using subdued dots.
- Use a low-opacity, non-semantic arc behind calories.
- Reduce badge, source, border, and footer contrast; make the hero 8–12% more compact.

## Non-goals

- No data, API, image validity, navigation, save-flow, Photo Hero, nutrition composition, or insight changes.
- Do not add image placeholders, cards per macro, strong gradients, progress semantics, or animation.

## Visual Rules

- Calories: 40–46px equivalent, 700 weight; `kcal` 15–18px equivalent and visually secondary.
- Macro dots use deep green, muted sage, and warm neutral only. They are not status colors.
- Background is an almost imperceptible sage-to-warm-white tonal transition with a softer border and shadow.
- The arc is a thin incomplete circle at 0.04–0.06 opacity. It never reflects nutritional progress.
- The optional source text stays visually below the rating badge and is rendered only when a trustworthy source exists. The current model has no source field, so it remains absent.

## Verification

Existing Hero validity tests continue to cover Photo/Data fallback behavior. Static visual-contract assertions will cover no macro dividers, dot markers, decorative arc, compact layout classes, and preserved footer. Run lint, typecheck, and WeChat build.
