# Meal Detail Hero Card Redesign

Date: 2026-07-30  
Status: approved

## Problem

The meal-detail hero card is crowded and hierarchical unclear: photo, nested score card, calories, and macros compete in a side-by-side layout.

## Goal

Make intake glanceable in one clear vertical stack without changing scoring logic, copy content, or the sections below the hero.

## Design

Photo-led vertical card:

1. **Full-width photo** (~16:10), clipped to the card top radius.
   - Top-left: score pill with grade circle + label (e.g. `A` + `优秀搭配`).
   - Bottom-right: keep `查看原图`; tap still opens image preview.
2. **Calories** as the primary number (~48px forest green) with smaller `kcal` unit.
3. **Three equal macro chips** in a row: protein / carbs / fat — value above, label below.
4. **Score footer row** (not a nested card): eyebrow `本餐评分`, one-line summary, `依据 ›`. Tap opens the existing score modal.

## Out of scope

- Nutrition composition, insight, ingredients, bottom actions
- Score calculation (`getMealScore`) and `scoreCopy` text
- API / store changes

## Files

- `mini-program/src/pages/meal-detail/index.tsx` — hero markup
- `mini-program/src/styles/page.scss` — hero styles under `.meal-detail-page__*`
- Existing meal-detail contract tests if they assert the old nested score-card structure

## Acceptance

- Hero no longer uses a nested white score card on the right of the photo
- Calories are the largest text in the card
- Macros render as a three-column chip row
- Score details remain reachable via the footer row → existing modal
- Photo preview still works
