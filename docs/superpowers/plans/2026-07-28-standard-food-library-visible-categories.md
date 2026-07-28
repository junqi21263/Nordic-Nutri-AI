# Standard Food Library Visible Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the current WeChat Developer Tools branch show twelve unique standard category icons, query complete category subtrees, and expose all 6,826 imported foods.

**Architecture:** Keep the existing CloudBase PG food model and authenticated HTTP API. Sync only the food-catalog frontend and the minimal server route/repository contract into the current root branch, preserving unrelated dirty Hunyuan work. Promote the 3,156 quarantined imported rows to published after a read-only count check, then validate the full client and server path.

**Tech Stack:** Taro 4, React, TypeScript, local SVG assets, CloudBase PG, Node.js 24, CloudBase HTTP Function Node.js 18.15.

---

### Task 1: Establish the root-branch frontend contract

**Files:**
- Modify: `mini-program/tests/food-catalog-login-profile.test.ts`
- Test: `mini-program/tests/food-category-search.test.ts`

- [ ] **Step 1: Update the contract expectations before implementation.**
  Assert that the page uses `STANDARD_FOOD_CATEGORY_ROOT_CODES`, sends `searchProductFoodCatalog("", 1, { categoryCode })`, and does not use `resolveCategorySearchQuery`.

- [ ] **Step 2: Add the icon/category contract.**
  Assert that all twelve standard root codes are present in the page icon map and that the page filters server categories through the root-code set.

- [ ] **Step 3: Run the focused tests and verify they fail against the current root branch.**
  Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --dir mini-program exec vitest run tests/food-catalog-login-profile.test.ts tests/food-category-search.test.ts`.

### Task 2: Sync the standard category API and labels

**Files:**
- Modify: `mini-program/src/api/food-catalog-api.ts`
- Modify: `mini-program/src/features/food-catalog/food-labels.ts`

- [ ] **Step 1: Extend the catalog response types.**
  Add `standard_food_v1` to search/discovery sources and optional pagination metadata.

- [ ] **Step 2: Add category-code search.**
  Implement `searchProductFoodCatalog(query, page, { categoryCode })` with `URLSearchParams`, omitting an empty query and sending `category=<root-code>`.

- [ ] **Step 3: Define the twelve root codes and display labels.**
  Add `STANDARD_FOOD_CATEGORY_ROOT_CODES` and map category codes using the first segment of `food.category` so child-category foods render under their root label.

### Task 3: Add unique local circular category icons

**Files:**
- Create: `mini-program/src/assets/icons/food-nuts.svg`
- Create: `mini-program/src/assets/icons/food-oil.svg`
- Create: `mini-program/src/assets/icons/food-bread.svg`
- Create: `mini-program/src/assets/icons/food-bowl.svg`
- Modify: `mini-program/src/components/nordic-icon/index.tsx`

- [ ] **Step 1: Add four monochrome SVGs using the existing 24px viewBox and current dark-green stroke style.**
  The icons represent nuts/seeds, oil/seasoning, bread/basic processing, and a regional staple bowl; each must contain no external URL or text.

- [ ] **Step 2: Register the four icon names in `NordicIconName` and `iconSources`.**

- [ ] **Step 3: Verify all twelve root codes map to a non-fallback icon.**
  Use `protein`, `food-fish`, `food-egg`, `food-bean`, `carbs`, `food-carrot`, `food-apple`, `food-nuts`, `food-oil`, `food-cup`, `food-bread`, and `food-bowl` exactly once.

### Task 4: Correct the food-catalog page behavior

**Files:**
- Modify: `mini-program/src/pages/food-catalog/index.tsx`

- [ ] **Step 1: Replace the all-category render with the twelve-root filter.**
  Filter `serverCategories` by `category.isActive && STANDARD_FOOD_CATEGORY_ROOT_CODES.has(category.code)`.

- [ ] **Step 2: Replace legacy keyword category search.**
  On a selected root category call `searchProductFoodCatalog("", 1, { categoryCode })`; keep discovery for the all-category state.

- [ ] **Step 3: Map each root code to its unique icon.**
  Remove the generic fallback for standard root codes and preserve the existing fallback list only for taxonomy API failure.

### Task 5: Align the root HTTP function source with the deployed contract

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/food-repository.cjs`
- Test: `cloudbase/functions/get-login-ticket/index.test.mjs`
- Test: `cloudbase/functions/get-login-ticket/food-repository.test.mjs`

- [ ] **Step 1: Add failing root-branch route tests.**
  Require `/foods` and `/foods/discover` to use `foodRepository.listFoods`, return `source: "standard_food_v1"`, and preserve the authenticated session guard.

- [ ] **Step 2: Implement the minimal route/repository sync.**
  Map repository rows to the existing client food contract, filter category roots through descendant category codes, and pass `.or()` a complete comma-separated PostgREST clause list.

- [ ] **Step 3: Run all function tests.**
  Run `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/*.test.mjs` and require 172 or more passing tests with zero failures.

### Task 6: Publish the imported food rows

**Files:** CloudBase PG `public.foods` only.

- [ ] **Step 1: Read the current status counts.**
  Confirm `published = 3,670` and `quarantined = 3,156` before mutation.

- [ ] **Step 2: Promote only the imported quarantined rows.**
  Execute one reviewed SQL statement: `UPDATE public.foods SET publish_status = 'published' WHERE publish_status = 'quarantined';`

- [ ] **Step 3: Read back counts and category coverage.**
  Require `published = 6,826`, `quarantined = 0`, and all twelve root categories to retain published food counts greater than zero.

### Task 7: Validate, build, and deploy

**Files:**
- Build output: `mini-program/dist/weapp/`

- [ ] **Step 1: Run the frontend unit tests.**
  Run `pnpm --dir mini-program test:unit` with temporary dependency symlinks only, then remove those symlinks.

- [ ] **Step 2: Run typecheck, WeChat build, and WXSS verification.**
  Run `pnpm --dir mini-program typecheck`, `pnpm --dir mini-program build:weapp`, and `pnpm --dir mini-program verify:weapp`.

- [ ] **Step 3: Deploy the existing `get-login-ticket` HTTP function.**
  Use CloudBase `manageFunctions(action="updateFunctionCode", functionName="get-login-ticket", functionRootPath="/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions", confirm=true)` without changing environment variables or permissions.

- [ ] **Step 4: Verify deployment status and runtime boundary.**
  Confirm the function is `Active`; an unauthenticated `/foods` request must remain `401`, while the authenticated Developer Tools request must return foods.

### Task 8: Commit and hand off

- [ ] **Step 1: Run `git diff --check` and confirm unrelated dirty files remain untouched.**
- [ ] **Step 2: Commit only the food-library source, tests, icons, and plan/spec files.**
- [ ] **Step 3: Report database counts, test/build results, deployment status, and the exact Developer Tools refresh/search steps.**
