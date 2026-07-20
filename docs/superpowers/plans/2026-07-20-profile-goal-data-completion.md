# Profile and Goal Data Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist user-entered nickname, current body data, and target data from the existing mini-program flows, then return them after login.

**Architecture:** Keep the HTTPS CloudBase function as the sole data boundary. Extend onboarding input state and its final transaction, then compose existing authenticated profile/body/goal write operations from the two profile screens. The server continues deriving the product user from the signed session.

**Tech Stack:** Taro React, TypeScript, Zustand, Vitest, Node.js HTTP CloudBase function, CloudBase PostgreSQL.

---

### Task 1: Onboarding captures profile and goal values

**Files:**
- Modify: `mini-program/src/features/onboarding/domain.ts`
- Modify: `mini-program/src/pages/body-profile/index.tsx`
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Modify: `mini-program/tests/onboarding-domain.test.ts`
- Modify: `mini-program/tests/body-goal-real-save-pages.test.ts`

- [ ] **Step 1: Write failing domain and page-contract tests**

```ts
expect(createInitialOnboardingDraft()).toMatchObject({ nickname: "" });
expect(source("body-profile")).toContain('setField("nickname"');
expect(source("nutrition-plan")).toContain("nickname: profile.nickname");
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `pnpm --dir mini-program vitest run tests/onboarding-domain.test.ts tests/body-goal-real-save-pages.test.ts`

Expected: failure because the onboarding body page and payload do not yet contain nickname handling.

- [ ] **Step 3: Add the minimum fields and forwarding**

```ts
// OnboardingDraft and ValidBodyProfile
nickname: string;

// validateBodyProfile
const nickname = draft.nickname.trim().slice(0, 40);
if (!nickname) errors.nickname = "请输入昵称";

// nutrition-plan final payload
nickname: profile.nickname,
```

Add the nickname input to the existing body-profile foundation card and preserve the current second-step visual structure. Do not add target-weight UI there; the existing goal-adjust page remains its only entry point.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run: `pnpm --dir mini-program vitest run tests/onboarding-domain.test.ts tests/body-goal-real-save-pages.test.ts`

Expected: both files pass.

### Task 2: Save nickname in the onboarding transaction

**Files:**
- Modify: `mini-program/src/api/product-data-api.ts`
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.test.mjs`

- [ ] **Step 1: Write the failing server test**

```js
const result = await createProductDataService({ db }).saveOnboarding("user-1", {
  nickname: "Lewis", goalType: "muscle_gain", targetWeightKg: 72,
  // existing valid body, preference, and macro fields
});
assert.equal(result.nickname, "Lewis");
assert.deepEqual(profileUpdatePayload, {
  nickname: "Lewis",
  onboarding_completed_at: expectedTimestamp,
});
```

- [ ] **Step 2: Run the server test and verify it fails**

Run: `node --test cloudbase/functions/get-login-ticket/product-data-service.test.mjs`

Expected: failure because `saveOnboarding` does not validate or write `nickname`.

- [ ] **Step 3: Extend the API type and server transaction**

```ts
// completeProductOnboarding input
nickname: string;
```

```js
const nickname = typeof input.nickname === "string" ? input.nickname.trim().slice(0, 40) : "";
if (!nickname) throw fail("昵称无效");
// Existing profile: update both fields. New profile: insert both fields.
{ nickname, onboarding_completed_at: new Date().toISOString() }
```

- [ ] **Step 4: Run the server test and verify it passes**

Run: `node --test cloudbase/functions/get-login-ticket/product-data-service.test.mjs`

Expected: all product data service tests pass.

### Task 3: Persist all editable profile page fields

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.test.mjs`
- Modify: `mini-program/src/api/product-data-api.ts`
- Modify: `mini-program/src/pages/profile-edit/index.tsx`
- Modify: `mini-program/src/pages/goal-adjust/index.tsx`
- Modify: `mini-program/tests/profile-edit-real-save.test.ts`
- Modify: `mini-program/tests/body-goal-real-save-pages.test.ts`

- [ ] **Step 1: Write failing page-contract tests**

```ts
expect(profilePage).toContain("saveProductBodyProfile");
expect(profilePage).toContain("saveProductGoal");
expect(goalPage).toContain("saveProductGoal");
```

```js
assert.deepEqual(await service.getAccount("user-1"), {
  // existing display fields,
  age: 28, sex: "male", heightCm: 175,
  activityLevel: "moderate", trainingDays: 4,
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `pnpm --dir mini-program vitest run tests/profile-edit-real-save.test.ts tests/body-goal-real-save-pages.test.ts`

Expected: failure because profile edit only writes nickname.

- [ ] **Step 3: Extend account details and compose authenticated writes after validation**

```ts
// getProductAccount return type
age: number | null;
sex: "female" | "male" | "undisclosed" | null;
heightCm: number | null;
activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high" | null;
trainingDays: number | null;

// Profile edit obtains the server's current complete body/goal record before writing.
const account = await getProductAccount();
if (account.age === null || account.sex === null || account.heightCm === null || account.activityLevel === null || account.trainingDays === null) {
  throw new Error("请先补全身体资料");
}
await saveProductProfile({ nickname: nextNickname });
await saveProductBodyProfile({
  age: account.age, birthDate: null, sex: account.sex,
  heightCm: account.heightCm, weightKg: nextWeight,
  activityLevel: account.activityLevel, trainingDays: account.trainingDays,
});
await saveProductGoal({
  goalType: goalTypeByLabel[goalLabel] ?? "muscle_gain",
  targetWeightKg: account.targetWeightKg,
  targetCaloriesKcal: account.targetCaloriesKcal,
  targetDate: null,
});
```

In `getAccount`, select `age,sex,height_cm,activity_level,training_days_per_week` from the current body row and include the camelCase fields above in its DTO. Keep writes sequential so failures are reported accurately; only update the local store after all calls resolve.

- [ ] **Step 4: Run tests and verify they pass**

Run: `pnpm --dir mini-program vitest run tests/profile-edit-real-save.test.ts tests/body-goal-real-save-pages.test.ts`

Expected: both files pass.

### Task 4: Full verification and deployment

**Files:**
- Modify only files from Tasks 1–3.

- [ ] **Step 1: Run the full verification suite**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs && pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Deploy the cloud function**

Run via CloudBase function manager: update `get-login-ticket` from `cloudbase/functions`.

Expected: a successful update request ID and function remains `Active`/`Available`.

- [ ] **Step 3: Manual acceptance**

In WeChat Developer Tools, complete onboarding with a nickname and check `account` returns it. Then use the existing goal-adjust page to save a target weight, relaunch, and confirm the returned values persist.
