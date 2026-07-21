# DeepSeek Meal Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist meal records in CloudBase PostgreSQL and provide server-side DeepSeek nutrition analysis without exposing API keys.

**Architecture:** Extend the existing product-session HTTP function with a dedicated meal service. The client receives only validated meal DTOs; the function resolves the authenticated user from the HMAC product session, calls DeepSeek with a strict JSON prompt, and performs all RDB writes using its server API key.

**Tech Stack:** Taro React, Zustand, Vitest, Node.js HTTP CloudBase function, CloudBase PostgreSQL, DeepSeek Chat Completions API.

---

### Task 1: Server-side DeepSeek analyzer

**Files:**
- Create: `cloudbase/functions/get-login-ticket/deepseek-meal-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/deepseek-meal-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Test: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Write failing analyzer tests**

```js
const analyze = createDeepseekMealService({ requestCompletion: async () => ({
  mealName: "鸡胸肉沙拉",
  items: [{ name: "鸡胸肉", quantityG: 150, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }],
}) });
assert.equal((await analyze({ items: [{ name: "鸡胸肉", quantityG: 150 }] })).mealName, "鸡胸肉沙拉");
await assert.rejects(() => analyze({ items: [{ name: "", quantityG: 5000 }] }), /无效/);
```

- [ ] **Step 2: Run the analyzer test and verify it fails**

Run: `node --test cloudbase/functions/get-login-ticket/deepseek-meal-service.test.mjs`

Expected: failure because the analyzer module does not exist.

- [ ] **Step 3: Implement bounded completion parsing**

```js
const response = await fetch("https://api.deepseek.com/chat/completions", {
  method: "POST",
  headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
  body: JSON.stringify({ model, temperature: 0, response_format: { type: "json_object" }, messages }),
  signal: AbortSignal.timeout(12_000),
});
```

Validate request item names (1–100 characters), quantities (0–2000g), response JSON shape, and all nutrient rates (0–2000). Throw public retryable errors for timeout, provider status, or invalid JSON. Do not log API headers, prompts, or model payloads.

- [ ] **Step 4: Verify analyzer tests pass**

Run: `node --test cloudbase/functions/get-login-ticket/deepseek-meal-service.test.mjs`

Expected: all analyzer tests pass.

### Task 2: Authenticated meal persistence service and HTTP routes

**Files:**
- Create: `cloudbase/functions/get-login-ticket/meal-data-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/meal-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Write failing service and route tests**

```js
const meal = await service.createMeal("user-1", {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  mealType: "lunch", name: "鸡胸肉沙拉", recordedAt: "2026-07-20T12:00:00.000Z",
  items: [{ name: "鸡胸肉", quantityG: 150, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }],
});
assert.equal(meal.userId, "user-1");
```

```js
const unauthorized = await fetch(`${baseUrl}/get-login-ticket/meals?date=2026-07-20`);
assert.equal(unauthorized.status, 401);
```

- [ ] **Step 2: Run service and route tests to verify failure**

Run: `node --test cloudbase/functions/get-login-ticket/meal-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: failure because meal routes and persistence service do not exist.

- [ ] **Step 3: Implement CRUD with ownership filters**

```js
// Every mutation scopes rows by both id and authenticated user ID.
await db.from("meal_records").update({ deleted_at: new Date().toISOString() }).eq("id", mealId).eq("user_id", userId);
```

Create meal rows before item rows, retrieve records with their items, and map snake_case database values to the client DTO. Use `client_request_id` to make create idempotent. Return only un-deleted records. For `/meal-analysis`, create an `ai_analysis` record only after DeepSeek output passes validation.

- [ ] **Step 4: Verify server suite passes**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs`

Expected: all function tests pass.

### Task 3: Mini-program meal API and store hydration

**Files:**
- Create: `mini-program/src/api/meal-data-api.ts`
- Modify: `mini-program/src/stores/meal-store.ts`
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/pages/meal-records/index.tsx`
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Modify: `mini-program/src/pages/portion-adjustment/index.tsx`
- Modify: `mini-program/src/pages/meal-detail/index.tsx`
- Create: `mini-program/tests/meal-data-api.test.ts`
- Modify: `mini-program/tests/meal-store.test.ts`

- [ ] **Step 1: Write failing client tests**

```ts
expect(await mapMealRecord(serverRecord)).toMatchObject({ id: "meal-1", title: "鸡胸肉沙拉", mealType: "午餐" });
await store.getState().refreshMeals("2026-07-20");
expect(store.getState().dataSource).toBe("remote");
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir mini-program exec vitest run tests/meal-data-api.test.ts tests/meal-store.test.ts`

Expected: failure because remote mapping and refresh action do not exist.

- [ ] **Step 3: Implement client boundary and safe refresh**

```ts
await createProductMeal({ mealType, name, recordedAt, items, clientRequestId: crypto.randomUUID() });
await useMealStore.getState().refreshMeals(getLocalDateString());
```

Keep fixture state as a fallback only when the remote request fails. Update local Zustand state only after server confirmation. Manual record, confirmed scanner result, portion adjustment, favorite toggle, and delete use the corresponding API then refresh the selected day.

- [ ] **Step 4: Verify focused tests pass**

Run: `pnpm --dir mini-program exec vitest run tests/meal-data-api.test.ts tests/meal-store.test.ts`

Expected: both files pass.

### Task 4: Configuration, full verification, and deployment

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/package.json` only if a runtime dependency is required.

- [ ] **Step 1: Verify no secret is committed**

Run: `git grep -nE 'sk-[A-Za-z0-9_-]{16,}|DEEPSEEK_API_KEY=' || true`

Expected: no API key value appears in tracked files; only the environment variable name may appear.

- [ ] **Step 2: Run full checks**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs && pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 3: Configure and deploy safely**

Set `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL` only through CloudBase function environment configuration after the user has rotated the exposed key. Update the `get-login-ticket` function code, then check its status is `Active` and `Available`.

- [ ] **Step 4: Manual acceptance**

Use a non-sensitive sample meal in WeChat Developer Tools: request analysis, save it, reload the app, edit a quantity, and delete it. Confirm `GET /meals` returns only the signed-in user's current records.
