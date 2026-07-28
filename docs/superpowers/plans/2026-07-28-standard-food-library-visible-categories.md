# Standard Food Library Visible Categories Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current WeChat Developer Tools branch show exactly 12 standard food-library root categories with unique circular icons, return foods for every category, and expose all 6,826 imported foods.

**Architecture:** Keep category taxonomy authoritative in CloudBase PostgreSQL. The mini program will filter the taxonomy response by the 12 root codes and send the selected root code to `/foods`; the server repository expands that code to its descendants. A one-time PostgreSQL update will promote the 3,156 quarantined imported foods to `published` without changing their content.

**Tech Stack:** Taro 4, React, TypeScript, local SVG assets, CloudBase HTTP Function, CloudBase PostgreSQL, Node.js test runner, Vitest, pnpm.

---

### Task 1: Add regression contracts for root-only categories and icon coverage

**Files:**
- Modify: `mini-program/tests/food-catalog-login-profile.test.ts`
- Modify: `mini-program/src/features/food-catalog/food-visuals.test.ts`
- Test: `cloudbase/functions/get-login-ticket/food-repository.test.mjs`

- [ ] **Step 1: Write failing frontend contracts**

Assert that the food catalog page contains `STANDARD_FOOD_CATEGORY_ROOT_CODES`, calls `searchProductFoodCatalog("", 1, { categoryCode })`, and maps every one of the 12 root codes to a non-fallback icon.

- [ ] **Step 2: Run the focused frontend test and confirm failure**

Run:
`pnpm --dir mini-program exec vitest run tests/food-catalog-login-profile.test.ts`

Expected: FAIL because the current root branch still imports `resolveCategorySearchQuery`, renders every active category, and has no standard root icon map.

- [ ] **Step 3: Add the server category-tree contract**

Add the repository test in `cloudbase/functions/get-login-ticket/food-repository.test.mjs` that calls `listFoods({ categoryCode: "meat_poultry" })` and expects foods assigned to `meat_poultry.*` descendants. This protects the non-empty category behavior.

- [ ] **Step 4: Run the backend focused test and confirm the existing server contract**

Run:
`PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/food-repository.test.mjs`

Expected: PASS for root-to-descendant category expansion before frontend edits.

### Task 2: Merge the standard catalog frontend into the active branch

**Files:**
- Modify: `mini-program/src/api/food-catalog-api.ts`
- Modify: `mini-program/src/features/food-catalog/food-labels.ts`
- Modify: `mini-program/src/pages/food-catalog/index.tsx`
- Modify: `mini-program/src/components/nordic-icon/index.tsx`
- Modify: `mini-program/tests/food-catalog-login-profile.test.ts`

- [ ] **Step 1: Add the 12-code root set and display labels**

Define `STANDARD_FOOD_CATEGORY_ROOT_CODES` with:
`meat_poultry`, `seafood`, `egg_dairy`, `plant_protein`, `grains_tubers`, `vegetables`, `fruits`, `nuts_seeds`, `oils_seasonings`, `beverages`, `basic_processed`, `regional_staples`.

Update `getFoodCategory` to use the first segment of a standard category code before legacy text inference.

- [ ] **Step 2: Extend the API request contract**

Change `searchProductFoodCatalog(query, page, options)` to send an optional `category` query parameter and accept `source: "standard_food_v1"` plus pagination.

- [ ] **Step 3: Restrict chips and category clicks**

Filter server categories with `category.isActive && STANDARD_FOOD_CATEGORY_ROOT_CODES.has(category.code)`. On click, call `searchProductFoodCatalog("", 1, { categoryCode })`; do not translate the category to a USDA keyword.

- [ ] **Step 4: Run the focused frontend test and confirm green**

Run:
`pnpm --dir mini-program exec vitest run tests/food-catalog-login-profile.test.ts`

Expected: PASS with the page using root codes and category-code requests.

### Task 3: Add unique local SVG category icons

**Files:**
- Create: `mini-program/src/assets/icons/food-nuts.svg`
- Create: `mini-program/src/assets/icons/food-oil.svg`
- Create: `mini-program/src/assets/icons/food-bread.svg`
- Create: `mini-program/src/assets/icons/food-bowl.svg`
- Modify: `mini-program/src/components/nordic-icon/index.tsx`
- Modify: `mini-program/src/pages/food-catalog/index.tsx`

- [ ] **Step 1: Add the four semantic SVG assets**

Use the existing local SVG stroke style and green palette. The assets must be static local files with no network URL or external font dependency.

- [ ] **Step 2: Register the icon names**

Add `food-nuts`, `food-oil`, `food-bread`, and `food-bowl` to `NordicIconName`, imports, and `iconSources`.

- [ ] **Step 3: Assign one icon to each root code**

Use this mapping: meat=`protein`, seafood=`food-fish`, egg_dairy=`food-egg`, plant_protein=`food-bean`, grains_tubers=`carbs`, vegetables=`food-carrot`, fruits=`food-apple`, nuts_seeds=`food-nuts`, oils_seasonings=`food-oil`, beverages=`food-cup`, basic_processed=`food-bread`, regional_staples=`food-bowl`.

- [ ] **Step 4: Run icon and type contracts**

Run:
`pnpm --dir mini-program exec vitest run tests/food-catalog-login-profile.test.ts`
and
`pnpm --dir mini-program typecheck`

Expected: PASS with no unknown icon names.

### Task 4: Publish the complete imported food set

**Files:**
- No application source file changes.
- CloudBase PostgreSQL table: `public.foods`.

- [ ] **Step 1: Re-read the current status counts**

Run read-only SQL:
`SELECT publish_status, COUNT(*) FROM public.foods GROUP BY publish_status ORDER BY publish_status`

Expected before mutation: `published=3670`, `quarantined=3156`, total `6826`.

- [ ] **Step 2: Apply the explicitly authorized data migration**

Execute one SQL statement through `managePgDatabase(action="execute", confirm=true)`:
`UPDATE public.foods SET publish_status = 'published' WHERE publish_status = 'quarantined'`

Do not change names, nutrition, category IDs, source IDs, provenance, or image fields.

- [ ] **Step 3: Verify the exact post-migration count**

Run:
`SELECT publish_status, COUNT(*) FROM public.foods GROUP BY publish_status ORDER BY publish_status`

Expected: one row `published=6826` and no `quarantined` row.

### Task 5: Build and validate the active mini program

**Files:**
- Generated output: `mini-program/dist/weapp/` only; do not commit generated output unless the repository policy requires it.

- [ ] **Step 1: Run all mini program tests**

Run:
`pnpm --dir mini-program test:unit`

Expected: all existing test files pass.

- [ ] **Step 2: Run typecheck, WeChat build, and WXSS verification**

Run:
`pnpm --dir mini-program typecheck`
`pnpm --dir mini-program build:weapp`
`pnpm --dir mini-program verify:weapp`

Expected: TypeScript exits 0, Webpack reports compiled successfully, and WXSS compatibility passes.

- [ ] **Step 3: Inspect the generated app output**

Confirm `mini-program/dist/weapp/app.json` exists and the generated food catalog page is present before asking Developer Tools to reload.

### Task 6: Deploy the minimum backend change and verify production state

**Files:**
- Deploy from: `cloudbase/functions/get-login-ticket` on the active branch only if it differs from the deployed standard-library implementation.

- [ ] **Step 1: Run the full backend test suite**

Run:
`PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/*.test.mjs`

Expected: all tests pass.

- [ ] **Step 2: Run CloudBase code review checks**

Review authentication guard, PG query shape, absence of client secrets, and unchanged function exposure before deployment.

- [ ] **Step 3: Deploy the active branch HTTP function code**

After the targeted server changes in this plan are applied, use `manageFunctions(action="updateFunctionCode", functionName="get-login-ticket", functionRootPath="/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions", confirm=true)`. Do not stage or remove the existing user-owned Hunyuan worker files; they are part of the active function package.

- [ ] **Step 4: Verify deployment**

Use `queryFunctions(action="listFunctions")` and confirm `get-login-ticket` is `Active` and `Type` is `HTTP`. In Developer Tools, reload the generated `dist/weapp`, click each root category, and confirm a non-empty food response.

- [ ] **Step 5: Commit only scoped source and spec changes**

Do not stage the existing `.env.example`, zip files, `hunyuan-worker-client` files, or `specs/` directory from the user’s unrelated work.
