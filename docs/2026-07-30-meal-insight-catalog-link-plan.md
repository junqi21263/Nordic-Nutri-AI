# Meal Insight + Catalog Link Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Wire DeepSeek meal insight to meal detail, link meal items to catalog foods (auto-create + classify on save), and show catalog images/insights on meal/ingredient detail.

**Architecture:** Thin-slice on meal save/read: resolve foods by normalized exact name, DeepSeek-classify + insert missing foods, persist `food_id` + `insight`, map image URLs into DTOs; frontend stops hardcoding insight and uses catalog assets.

**Tech Stack:** CloudBase PG + get-login-ticket Node services, DeepSeek, Taro mini-program

---

### Task 1: Migration
- Create `cloudbase/pg/migrations/0027_meal_item_food_and_insight.sql` (+ test)
- Add `meal_records.insight`, `meal_items.food_id`

### Task 2: Food resolve + classify helper
- Create DeepSeek food classify + resolveOrCreateFoods
- Unit tests with mocks

### Task 3: meal-data-service
- On create/update: resolve foods, set insight from analysis advice or DeepSeek
- mapMeal joins food images + insight/foodId

### Task 4: Frontend mapper + meal-detail + ingredient-detail
- Types, mapper, UI

### Task 5: Verify tests + build:weapp
