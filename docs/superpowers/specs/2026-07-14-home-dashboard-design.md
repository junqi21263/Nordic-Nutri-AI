# Home Dashboard Design

## Purpose

Restore the Home page as the fourth core screen of Nordic Nutri AI. It must make today’s calorie budget, macro progress, AI guidance, logging actions, and meals readable at a glance on a WeChat Mini Program device.

## Visual Direction

Northic organic dashboard, based on the provided Stitch Home design. The existing brand system is retained: forest green `#153f2b`, warm surface `#f2ebe1`, soft green `#eef3ec`, and page background `#fbfaf7`. Existing project font tokens are retained because they are the app’s approved Mini Program-safe typography system.

## Layout

1. A safe-area-aware header shows the avatar, greeting, goal, and an overflow action.
2. A single warm daily target card has a left circular remaining-calorie indicator and right-aligned macro progress rows.
3. A white AI guidance card follows, with a green icon disc and a compact insight label.
4. Primary and secondary meal logging actions share one horizontal row.
5. Today’s meals use image thumbnails, metadata, kcal values, edit affordances, and a dashed add-meal affordance.
6. The custom tab bar remains fixed above the home indicator; page content reserves its complete height.

## Data and Interaction

The existing meal-store `DailySummary` and meal data remain the only data sources. Existing navigation destinations are retained: scanner for meal entry, meal detail for a meal, and meal records for the full list. No data shape or routing contract changes.

## Verification

- Contract tests assert the dashboard hierarchy and visual hooks.
- Unit, type, and WeChat builds pass.
- The generated `dist/weapp` is the directory used by WeChat Developer Tools for a 390px/iPhone 14 Pro visual check.
