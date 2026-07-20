# Phase 3A-1 Auth and Profile Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the first user vertical slice's fixture identity state with an authenticated, recoverable Supabase session and real Profile, Settings, Body Profile, and Health Goal data without redesigning existing pages.

**Architecture:** Add a repository boundary with fixture and Supabase adapters, then make Zustand stores consume normalized domain data rather than Supabase directly. A singleton Auth Bootstrap owns restore, server validation, one refresh retry, initial silent login, and global user-data cleanup; pages only consume state and invoke store actions.

**Tech Stack:** Taro 4, React 18, Zustand 5, TypeScript, Vitest, `@supabase/supabase-js` 2, Supabase PostgREST/Auth.

---

## File structure

- Create: `mini-program/src/repositories/types.ts` — normalized repository result, error, pagination and cancellation contracts.
- Create: `mini-program/src/repositories/runtime-adapter.ts` — selects real or fixture adapters from public runtime flags.
- Create: `mini-program/src/repositories/auth-repository.ts` — bootstrap, login, refresh, logout and current-user boundary.
- Create: `mini-program/src/repositories/profile-repository.ts` — Profile and user_settings reads/writes.
- Create: `mini-program/src/repositories/body-profile-repository.ts` — current/history/versioned Body Profile operations.
- Create: `mini-program/src/repositories/health-goal-repository.ts` — current/history/versioned Goal operations.
- Create: `mini-program/src/auth/auth-bootstrap.ts` — singleton startup state machine and foreground token handling.
- Create: `mini-program/src/auth/auth-cleanup.ts` — centralized cross-store/query-cache cleanup.
- Create: `mini-program/src/pages/auth-entry/index.tsx` — minimal post-logout/expired-session login entry using existing components only.
- Create: `mini-program/tests/repository-adapter.test.ts`, `mini-program/tests/auth-bootstrap.test.ts`, `mini-program/tests/profile-settings-repository.test.ts`, `mini-program/tests/body-goal-repository.test.ts`.
- Modify: `mini-program/src/auth/auth-store.ts`, `mini-program/src/auth/session-manager.ts`, `mini-program/src/api/backend-client.ts`, `mini-program/src/app.tsx`, `mini-program/src/app.config.ts`, `mini-program/src/stores/profile-store.ts`, `mini-program/src/pages/profile/index.tsx`, `mini-program/src/pages/profile-edit/index.tsx`, `mini-program/src/pages/diet-preferences/index.tsx`, `mini-program/src/pages/body-profile/index.tsx`, `mini-program/src/pages/goal-adjust/index.tsx`, `.env.example`, `mini-program/config/index.ts`.

### Task 1: Define repository contracts and runtime adapter

**Files:**
- Create: `mini-program/src/repositories/types.ts`
- Create: `mini-program/src/repositories/runtime-adapter.ts`
- Test: `mini-program/tests/repository-adapter.test.ts`

- [ ] **Step 1: Write the failing runtime-selection tests**

```ts
import { describe, expect, it } from "vitest";
import { selectRuntimeAdapter } from "../src/repositories/runtime-adapter";

describe("runtime repository adapter", () => {
  it("uses Supabase only for development with the real-backend flag", () => {
    expect(selectRuntimeAdapter({ environment: "development", useRealBackend: true })).toBe("supabase");
  });

  it("keeps production and disabled development on fixtures", () => {
    expect(selectRuntimeAdapter({ environment: "production", useRealBackend: true })).toBe("fixture");
    expect(selectRuntimeAdapter({ environment: "development", useRealBackend: false })).toBe("fixture");
  });
});
```

- [ ] **Step 2: Run the test to verify the expected missing-module failure**

Run: `pnpm --dir mini-program test:unit -- repository-adapter.test.ts`
Expected: FAIL because `runtime-adapter` does not exist.

- [ ] **Step 3: Add the minimal contracts and selector**

```ts
// repositories/types.ts
export type RepositoryMode = "fixture" | "supabase";
export type RepositoryErrorCode = "UNAUTHORIZED" | "VALIDATION" | "NETWORK" | "NOT_FOUND" | "CONFLICT" | "UNKNOWN";
export type RepositoryError = { code: RepositoryErrorCode; message: string; retryable: boolean; requestId?: string };
export type RepositoryResult<T> = { data: T; requestId?: string };
export type PageCursor = { offset: number; limit: number; hasMore: boolean };

// repositories/runtime-adapter.ts
import type { AppEnvironment } from "../api/environment";
import type { RepositoryMode } from "./types";

export function selectRuntimeAdapter(config: { environment: AppEnvironment; useRealBackend: boolean }): RepositoryMode {
  return config.environment === "development" && config.useRealBackend ? "supabase" : "fixture";
}
```

- [ ] **Step 4: Run the focused test**

Run: `pnpm --dir mini-program test:unit -- repository-adapter.test.ts`
Expected: PASS with 2 tests.

- [ ] **Step 5: Commit the isolated adapter boundary**

```bash
git add mini-program/src/repositories/types.ts mini-program/src/repositories/runtime-adapter.ts mini-program/tests/repository-adapter.test.ts
git commit -m "feat: add runtime repository adapter"
```

### Task 2: Build the Auth Bootstrap state machine

**Files:**
- Create: `mini-program/src/repositories/auth-repository.ts`
- Create: `mini-program/src/auth/auth-bootstrap.ts`
- Create: `mini-program/src/auth/auth-cleanup.ts`
- Modify: `mini-program/src/auth/auth-store.ts`
- Modify: `mini-program/src/auth/session-manager.ts`
- Modify: `mini-program/src/api/backend-client.ts`
- Test: `mini-program/tests/auth-bootstrap.test.ts`

- [ ] **Step 1: Write failing bootstrap tests for restore, one refresh retry, single login, and cleanup**

```ts
it("restores a verified session without calling wx.login", async () => {
  const login = vi.fn();
  const bootstrap = createAuthBootstrap({ restore: vi.fn().mockResolvedValue(session), getUser: vi.fn().mockResolvedValue(user), refresh: vi.fn(), login, loadIdentity: vi.fn() });
  await bootstrap.start();
  expect(login).not.toHaveBeenCalled();
  expect(bootstrap.getState().status).toBe("authenticated");
});

it("refreshes and retries getUser once before clearing an invalid session", async () => {
  const getUser = vi.fn().mockRejectedValueOnce({ status: 401 }).mockRejectedValueOnce({ status: 401 });
  const refresh = vi.fn().mockResolvedValue(null);
  const clear = vi.fn();
  const bootstrap = createAuthBootstrap({ restore: vi.fn().mockResolvedValue(session), getUser, refresh, clear, login: vi.fn(), loadIdentity: vi.fn() });
  await bootstrap.start();
  expect(refresh).toHaveBeenCalledTimes(1);
  expect(clear).toHaveBeenCalledTimes(1);
});

it("shares one in-flight initial wx.login operation", async () => {
  const login = vi.fn().mockResolvedValue(user);
  const bootstrap = createAuthBootstrap({ restore: vi.fn().mockResolvedValue(null), getUser: vi.fn(), refresh: vi.fn(), login, loadIdentity: vi.fn() });
  await Promise.all([bootstrap.start(), bootstrap.start()]);
  expect(login).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm --dir mini-program test:unit -- auth-bootstrap.test.ts`
Expected: FAIL because `createAuthBootstrap` is absent.

- [ ] **Step 3: Implement the state machine and safe request wrapper**

```ts
export type AuthBootstrapStatus = "initializing" | "authenticated" | "unauthenticated";

export function createAuthBootstrap(deps: AuthBootstrapDependencies) {
  let inFlight: Promise<void> | null = null;
  const start = () => inFlight ??= (async () => {
    const session = await deps.restore();
    if (!session) return deps.login().then(deps.loadIdentity).then(() => setStatus("authenticated"));
    try { await deps.getUser(); }
    catch (error) {
      if (!isUnauthorizedRequestError(error) || !(await deps.refresh())) return deps.clear().then(() => setStatus("unauthenticated"));
      await deps.getUser();
    }
    await deps.loadIdentity();
    setStatus("authenticated");
  })().finally(() => { inFlight = null; });
  return { start, getState: () => state };
}
```

Extend `withAuthRefresh` so a failed refresh throws the original unauthorized error after `clearInvalidSession`; never issue a second request retry. Add `authBootstrapStatus` and `loginEntryReason` to Auth Store, while keeping the Supabase client out of Zustand.

- [ ] **Step 4: Integrate app lifecycle exactly once**

In `app.tsx`, call `authBootstrap.start()` in `useLaunch`; use `Taro.onAppShow` to call `supabase.auth.startAutoRefresh()` and `Taro.onAppHide` to call `stopAutoRefresh()`. Register those callbacks once and return their cleanup. Keep route decisions in the bootstrap state, not in individual pages.

- [ ] **Step 5: Run auth tests and typecheck**

Run: `pnpm --dir mini-program test:unit -- auth-infrastructure.test.ts auth-bootstrap.test.ts && pnpm --dir mini-program typecheck`
Expected: PASS; no TypeScript errors.

- [ ] **Step 6: Commit auth lifecycle work**

```bash
git add mini-program/src/auth mini-program/src/repositories/auth-repository.ts mini-program/src/api/backend-client.ts mini-program/src/app.tsx mini-program/tests/auth-bootstrap.test.ts
git commit -m "feat: bootstrap persistent WeChat auth sessions"
```

### Task 3: Add the minimal login entry and safe logout

**Files:**
- Create: `mini-program/src/pages/auth-entry/index.tsx`
- Modify: `mini-program/src/app.config.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Modify: `mini-program/src/auth/auth-cleanup.ts`
- Test: `mini-program/tests/auth-bootstrap.test.ts`

- [ ] **Step 1: Add failing logout and login-entry tests**

```ts
it("clears every user store before showing the manual login entry after signOut", async () => {
  const clear = vi.fn();
  await signOutAndReset({ signOut: vi.fn(), clearUserStores: clear });
  expect(clear).toHaveBeenCalledOnce();
});

it("does not expose the development auth harness in the production route list", () => {
  expect(getProductionPages()).not.toContain("pages/dev-auth-harness/index");
  expect(getProductionPages()).toContain("pages/auth-entry/index");
});
```

- [ ] **Step 2: Run the test and observe failure**

Run: `pnpm --dir mini-program test:unit -- auth-bootstrap.test.ts`
Expected: FAIL because `signOutAndReset` and the entry page are absent.

- [ ] **Step 3: Implement the login entry with existing visual primitives**

The page must use `PageLayout`, `AppCard`, `AppButton`, `LoadingState`, `ErrorState`, and the existing feedback store. It contains only a concise title, a “微信登录” button, a saving/loading-disabled state, a retry action for retryable errors, and no diagnostic/token/code/openid text. The button calls `authBootstrap.loginFromEntry()`.

Add a single “退出登录” action to the existing Profile settings group. Its handler calls `signOutAndReset`, then navigates to `/pages/auth-entry/index`. Do not add it to tabBar.

- [ ] **Step 4: Run focused tests and build**

Run: `pnpm --dir mini-program test:unit -- auth-bootstrap.test.ts dev-auth-harness.test.ts && pnpm --dir mini-program build:weapp`
Expected: PASS; generated production pages exclude the dev harness.

- [ ] **Step 5: Commit the entry/exit flow**

```bash
git add mini-program/src/pages/auth-entry mini-program/src/pages/profile/index.tsx mini-program/src/app.config.ts mini-program/src/auth/auth-cleanup.ts mini-program/tests/auth-bootstrap.test.ts
git commit -m "feat: add safe login entry and logout"
```

### Task 4: Implement Profile and Settings repositories plus store synchronization

**Files:**
- Create: `mini-program/src/repositories/profile-repository.ts`
- Modify: `mini-program/src/stores/profile-store.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Modify: `mini-program/src/pages/profile-edit/index.tsx`
- Modify: `mini-program/src/pages/diet-preferences/index.tsx`
- Test: `mini-program/tests/profile-settings-repository.test.ts`

- [ ] **Step 1: Write failing repository tests**

```ts
it("updates only allowed profile columns and returns the server row", async () => {
  const update = vi.fn().mockResolvedValue({ data: { id: "u1", nickname: "北欧用户", timezone: "Asia/Shanghai" }, error: null });
  await createProfileRepository(client(update)).update({ nickname: "北欧用户", timezone: "Asia/Shanghai" });
  expect(update).toHaveBeenCalledWith({ nickname: "北欧用户", timezone: "Asia/Shanghai" });
});

it("maps user_settings validation failures without mutating the current store", async () => {
  const store = createProfileStore();
  await expect(store.getState().saveSettings({ mealsPerDay: 6 })).rejects.toMatchObject({ code: "VALIDATION" });
  expect(store.getState().settings.mealsPerDay).toBe(3);
});

it("clears profile and settings when the authenticated user changes", () => {
  const store = createProfileStore();
  store.getState().hydrate("u1", profile, settings);
  store.getState().beginUser("u2");
  expect(store.getState().userId).toBe("u2");
  expect(store.getState().profile).toBeNull();
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir mini-program test:unit -- profile-settings-repository.test.ts`
Expected: FAIL because repository/store async APIs are absent.

- [ ] **Step 3: Implement normalized CRUD and hydrate actions**

`profile-repository` must select the current user’s `profiles` and `user_settings` separately, map snake_case to page-domain camelCase, and update only the grant-allowed columns. It must never include `id` in an update payload. `profile-store` gains `userId`, `dataStatus`, `saveStatus`, `error`, `hydrate`, `beginUser`, `saveProfile`, `saveSettings`, and `resetUserData`; fixture behavior remains when the runtime adapter is fixture.

- [ ] **Step 4: Connect existing pages without redesign**

Replace direct `setProfile` / `setSetting` save paths with async store actions. Preserve all existing fields and layout. Add only existing loading/empty/error components, disabled save buttons, success feedback, validation feedback, and retry callbacks. After a successful save, update state from the returned/re-read server row.

- [ ] **Step 5: Run tests, lint and typecheck**

Run: `pnpm --dir mini-program test:unit -- profile-settings-repository.test.ts coach-profile.test.ts && pnpm --dir mini-program lint && pnpm --dir mini-program typecheck`
Expected: PASS.

- [ ] **Step 6: Commit Profile / Settings integration**

```bash
git add mini-program/src/repositories/profile-repository.ts mini-program/src/stores/profile-store.ts mini-program/src/pages/profile mini-program/src/pages/profile-edit mini-program/src/pages/diet-preferences mini-program/tests/profile-settings-repository.test.ts
git commit -m "feat: connect profile and settings repositories"
```

### Task 5: Implement versioned Body Profile and Health Goal repositories

**Files:**
- Create: `mini-program/src/repositories/body-profile-repository.ts`
- Create: `mini-program/src/repositories/health-goal-repository.ts`
- Modify: `mini-program/src/features/onboarding/domain.ts`
- Modify: `mini-program/src/pages/body-profile/index.tsx`
- Modify: `mini-program/src/pages/goal-adjust/index.tsx`
- Test: `mini-program/tests/body-goal-repository.test.ts`

- [ ] **Step 1: Write failing versioning and validation tests**

```ts
it("inserts a new current Body Profile instead of updating history", async () => {
  const insert = vi.fn().mockResolvedValue({ data: bodyRow, error: null });
  await createBodyProfileRepository(client(insert)).saveVersion({ birthDate: "1995-01-15", sex: "male", heightCm: 175, weightKg: 70, activityLevel: "moderate", trainingDays: 3 }, "2026-07-16");
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ age: 31, birth_date: "1995-01-15", is_current: true }));
});

it("rejects a Goal target date that is not later than today", () => {
  expect(() => validateGoalInput({ goalType: "muscle_gain", targetWeightKg: 74, targetDate: "2026-07-16" }, "2026-07-16")).toThrow("目标日期必须晚于今天");
});

it("reads only one current record and exposes ordered history", async () => {
  const query = createHistoryQuery([oldRow, currentRow]);
  const result = await createBodyProfileRepository(query).getCurrentAndHistory();
  expect(result.current.id).toBe(currentRow.id);
  expect(result.history.map((row) => row.id)).toEqual([currentRow.id, oldRow.id]);
});
```

- [ ] **Step 2: Run the focused test and observe failure**

Run: `pnpm --dir mini-program test:unit -- body-goal-repository.test.ts`
Expected: FAIL because Body Profile / Goal repositories are absent.

- [ ] **Step 3: Implement Body Profile contract mapping**

Implement `ageOnDate(birthDate, today)` with month/day boundary handling. Saving inserts `{ user_id, age, birth_date, sex, height_cm, weight_kg, activity_level, training_days_per_week, is_current: true }`; no update of an old Body Profile is permitted. Current queries filter `is_current=true`; history orders by `effective_at.desc`.

- [ ] **Step 4: Implement Goal contract mapping**

Map UI `maintenance` to database `maintain`; map database values back on read. Saving inserts a new `{ user_id, goal_type, target_weight_kg, target_date, is_current: true }` row; current and history have the same query semantics as Body Profile.

- [ ] **Step 5: Connect current Body Profile and Goal pages**

Hydrate existing page drafts after Auth Bootstrap. On first save, create current versions; on edit, create new versions. Keep current page layout and validation messages. Display a necessary inline guide on Goal Adjust when no current Body Profile exists and disable its save action until the user returns to complete Body Profile.

- [ ] **Step 6: Run tests and commit**

Run: `pnpm --dir mini-program test:unit -- body-goal-repository.test.ts onboarding-domain.test.ts && pnpm --dir mini-program typecheck`
Expected: PASS.

```bash
git add mini-program/src/repositories/body-profile-repository.ts mini-program/src/repositories/health-goal-repository.ts mini-program/src/features/onboarding/domain.ts mini-program/src/pages/body-profile mini-program/src/pages/goal-adjust mini-program/tests/body-goal-repository.test.ts
git commit -m "feat: connect versioned body profile and goals"
```

### Task 6: Verify real development Auth and 3A-1 data flow

**Files:**
- Modify: `.env.example`
- Test: `mini-program/tests/auth-bootstrap.test.ts`

- [ ] **Step 1: Add production-flag contract tests**

```ts
it("does not enable the real backend in production configuration", () => {
  expect(selectRuntimeAdapter({ environment: "production", useRealBackend: true })).toBe("fixture");
});
```

- [ ] **Step 2: Run the complete static quality suite**

Run: `pnpm --dir mini-program test:unit && pnpm --dir mini-program lint && pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && git diff --check`
Expected: every command exits 0.

- [ ] **Step 3: Run the real development manual checklist in WeChat DevTools**

Use `TARO_APP_ENABLE_REAL_AUTH=true` and `TARO_APP_USE_REAL_BACKEND=true`; import `mini-program/dist/weapp`. Verify first login, second login returns the same user, `last_login_at` changes, cold start restores session, `auth.getUser` succeeds, Profile/Settings do not duplicate, Body Profile/Goal create histories, logout clears state, and a protected request after logout returns UNAUTHORIZED.

- [ ] **Step 4: Commit test/config completion**

```bash
git add .env.example mini-program/tests/auth-bootstrap.test.ts
git commit -m "test: verify phase 3a auth and profile flow"
```
