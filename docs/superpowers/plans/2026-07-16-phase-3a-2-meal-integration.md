# Phase 3A-2 Manual Meal Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the existing manual meal, records, and detail UI to real Supabase data with idempotent create, atomic multi-item edit, soft delete, archive restore, filtering, and pagination.

**Architecture:** Keep the existing Meal domain as the page-facing model. A Meal Repository maps between it and Supabase rows/RPC inputs. `save_meal_atomic` creates idempotently; a new SECURITY INVOKER `update_meal_atomic` replaces a meal and all items in one transaction, so an invalid item cannot leave a partial edit.

**Tech Stack:** Taro 4, React 18, Zustand 5, TypeScript, Vitest, Supabase PostgREST, PostgreSQL RPCs, Edge Functions.

---

## File structure

- Create: database migration through `pnpm exec supabase migration new phase3a_meal_atomic_update` — defines `public.update_meal_atomic(jsonb)` and grants execute to `authenticated`.
- Create: `mini-program/src/repositories/meal-repository.ts` — normalized CRUD, filters, pagination and RPC calls.
- Create: `mini-program/src/repositories/client-request-id.ts` — stable UUID generation/reuse during retry.
- Create: `mini-program/tests/meal-repository.test.ts`, `mini-program/tests/meal-remote-store.test.ts`.
- Modify: `supabase/tests/test_backend_phase25_static.py`, `supabase/tests/auth_rls_integration.sh`, `mini-program/src/stores/meal-store.ts`, `mini-program/src/pages/manual-meal/index.tsx`, `mini-program/src/pages/meal-records/index.tsx`, `mini-program/src/pages/meal-detail/index.tsx`, `mini-program/src/api/database.types.ts`.

### Task 1: Add the atomic multi-item edit RPC with a migration

**Files:**
- Create: migration emitted by `pnpm exec supabase migration new phase3a_meal_atomic_update`
- Modify: `supabase/tests/test_backend_phase25_static.py`
- Test: `supabase/tests/auth_rls_integration.sh`

- [ ] **Step 1: Write static contract assertions before SQL**

Add assertions that the migration contains all of the following exact security properties:

```python
assert "create or replace function public.update_meal_atomic(p_input jsonb)" in migration
assert "security invoker" in migration
assert "v_user_id uuid := auth.uid()" in migration
assert "raise exception 'UNAUTHORIZED'" in migration
assert "raise exception 'NOT_FOUND'" in migration
assert "delete from public.meal_items where meal_record_id = v_meal_id" in migration
assert "grant execute on function public.update_meal_atomic(jsonb) to authenticated" in migration
```

- [ ] **Step 2: Run static tests to verify failure**

Run: `python3 -m unittest supabase.tests.test_backend_phase25_static -v`
Expected: FAIL because the migration and function do not exist.

- [ ] **Step 3: Generate the migration with the Supabase CLI**

Run: `pnpm exec supabase migration new phase3a_meal_atomic_update`
Expected: CLI creates one timestamped SQL file under `supabase/migrations/`; use that emitted path for the next step.

- [ ] **Step 4: Implement the transaction-safe function**

The migration function must follow this exact shape:

```sql
create or replace function public.update_meal_atomic(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meal_id uuid := (p_input->>'mealId')::uuid;
  v_item jsonb;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if v_meal_id is null or jsonb_typeof(p_input->'items') <> 'array' or jsonb_array_length(p_input->'items') = 0 then
    raise exception 'VALIDATION_ERROR';
  end if;
  perform 1 from public.meal_records where id = v_meal_id and user_id = v_user_id and deleted_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;
  update public.meal_records
  set name = p_input->>'name', meal_type = p_input->>'mealType', recorded_at = (p_input->>'recordedAt')::timestamptz,
      is_favorite = coalesce((p_input->>'isFavorite')::boolean, false)
  where id = v_meal_id and user_id = v_user_id;
  delete from public.meal_items where meal_record_id = v_meal_id;
  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    insert into public.meal_items (meal_record_id, food_id, name, ai_quantity_g, confirmed_quantity_g, calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g)
    values (v_meal_id, nullif(v_item->>'foodId','')::uuid, v_item->>'name', nullif(v_item->>'aiQuantityG','')::numeric,
      (v_item->>'confirmedQuantityG')::numeric, (v_item->>'caloriesPer100g')::numeric, (v_item->>'proteinGPer100g')::numeric,
      (v_item->>'carbsGPer100g')::numeric, (v_item->>'fatGPer100g')::numeric);
  end loop;
  select jsonb_build_object('meal', to_jsonb(m), 'items', coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb)) into v_result
  from public.meal_records m left join public.meal_items i on i.meal_record_id = m.id where m.id = v_meal_id group by m.id;
  return v_result;
end;
$$;
grant execute on function public.update_meal_atomic(jsonb) to authenticated;
```

- [ ] **Step 5: Verify migration, local database and remote deployment**

Run: `pnpm exec supabase db reset && python3 -m unittest supabase.tests.test_backend_phase25_static -v && bash supabase/tests/auth_rls_integration.sh`
Expected: local migration applies; static and RLS suites pass.

Run after local verification: `pnpm exec supabase db push --project-ref bghrpsrpekbbyuoyhncl && pnpm exec supabase functions deploy save-meal --project-ref bghrpsrpekbbyuoyhncl`
Expected: migration and updated function contract are deployed to development.

- [ ] **Step 6: Commit migration and database tests**

```bash
git add supabase/migrations supabase/tests/test_backend_phase25_static.py supabase/tests/auth_rls_integration.sh
git commit -m "feat: add atomic manual meal editing"
```

### Task 2: Define meal repository mappings and idempotent create

**Files:**
- Create: `mini-program/src/repositories/client-request-id.ts`
- Create: `mini-program/src/repositories/meal-repository.ts`
- Test: `mini-program/tests/meal-repository.test.ts`

- [ ] **Step 1: Write failing create/list mapping tests**

```ts
it("reuses one client request id when a save is retried", async () => {
  const ids = createClientRequestIds(() => "00000000-0000-4000-8000-000000000001");
  expect(ids.forDraft("draft-1")).toBe(ids.forDraft("draft-1"));
});

it("sends manual creation through save-meal and trusts returned totals", async () => {
  const invoke = vi.fn().mockResolvedValue({ data: { meal: rowWithServerTotals, items: itemRows }, error: null });
  const result = await createMealRepository(client(invoke)).create(input);
  expect(invoke).toHaveBeenCalledWith("save_meal_atomic", expect.objectContaining({ p_input: expect.objectContaining({ clientRequestId: input.clientRequestId }) }));
  expect(result.calories).toBe(rowWithServerTotals.calories_kcal);
});

it("reads only active records for normal lists and applies date, type, keyword, range and order", async () => {
  const query = createQuerySpy();
  await createMealRepository(query).list({ date: "2026-07-16", mealType: "lunch", keyword: "鸡", offset: 12, limit: 12 });
  expect(query.from).toHaveBeenCalledWith("active_meal_records");
  expect(query.range).toHaveBeenCalledWith(12, 23);
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir mini-program test:unit -- meal-repository.test.ts`
Expected: FAIL because Meal Repository and request-id utility are absent.

- [ ] **Step 3: Implement domain mapping and create/list APIs**

Map `meal_records` / `meal_items` to the existing `Meal` domain: derive local `date` and `time` from `recorded_at`, format `confirmed_quantity_g` as `amount`, and calculate display nutritional fields from server rows. Use `save_meal_atomic` for `create`; retain the UUID for retries until the create finishes. Use `active_meal_records` for normal list reads and a separate `listArchived` query against `meal_records` with `deleted_at.not.is.null`.

- [ ] **Step 4: Run the focused repository test**

Run: `pnpm --dir mini-program test:unit -- meal-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit repository create/list support**

```bash
git add mini-program/src/repositories/client-request-id.ts mini-program/src/repositories/meal-repository.ts mini-program/tests/meal-repository.test.ts
git commit -m "feat: add manual meal repository"
```

### Task 3: Add atomic edit, soft delete, restore and pagination repository methods

**Files:**
- Modify: `mini-program/src/repositories/meal-repository.ts`
- Modify: `mini-program/src/api/database.types.ts`
- Test: `mini-program/tests/meal-repository.test.ts`

- [ ] **Step 1: Write failing edit/archive tests**

```ts
it("uses update_meal_atomic for multi-item edits", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: { meal: row, items: itemRows }, error: null });
  await createMealRepository(client(rpc)).update("meal-1", input);
  expect(rpc).toHaveBeenCalledWith("update_meal_atomic", { p_input: expect.objectContaining({ mealId: "meal-1", items: input.items }) });
});

it("archives and restores only the requested owned meal", async () => {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ data: row, error: null }) });
  await createMealRepository(client(update)).archive("meal-1");
  await createMealRepository(client(update)).restore("meal-1");
  expect(update).toHaveBeenNthCalledWith(1, { deleted_at: expect.any(String) });
  expect(update).toHaveBeenNthCalledWith(2, { deleted_at: null });
});
```

- [ ] **Step 2: Run the focused test and verify failure**

Run: `pnpm --dir mini-program test:unit -- meal-repository.test.ts`
Expected: FAIL because update/archive/restore methods are absent.

- [ ] **Step 3: Implement update and archive APIs**

Add `Database.public.Functions.update_meal_atomic` types generated from the deployed schema. `update` calls the new RPC and maps its returned JSON. `archive` sets `deleted_at` to ISO now; `restore` sets it to null. Every mutation returns the server row and maps PostgREST/RPC errors to `RepositoryError`; it never accepts a caller-provided `user_id`.

- [ ] **Step 4: Run focused repository tests**

Run: `pnpm --dir mini-program test:unit -- meal-repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit edit/archive support**

```bash
git add mini-program/src/repositories/meal-repository.ts mini-program/src/api/database.types.ts mini-program/tests/meal-repository.test.ts
git commit -m "feat: add meal edit archive and restore"
```

### Task 4: Evolve Meal Store into fixture/remote state without changing its page model

**Files:**
- Modify: `mini-program/src/stores/meal-store.ts`
- Test: `mini-program/tests/meal-remote-store.test.ts`

- [ ] **Step 1: Write failing remote-store consistency tests**

```ts
it("ignores an older list response after the selected date changes", async () => {
  const deferred = createDeferred<Meal[]>();
  const store = createMealStoreWithRepository({ list: vi.fn().mockReturnValue(deferred.promise) });
  void store.getState().loadRemote();
  store.getState().setSelectedDate("2026-07-17");
  deferred.resolve([oldDateMeal]);
  await flushPromises();
  expect(store.getState().meals).not.toContainEqual(oldDateMeal);
});

it("updates list and detail state from server results after edit and archive", async () => {
  const store = createMealStoreWithRepository(repositoryReturning(updatedMeal));
  await store.getState().updateRemote("meal-1", input);
  expect(store.getState().getMealById("meal-1")).toEqual(updatedMeal);
  await store.getState().archiveRemote("meal-1");
  expect(store.getState().getMealById("meal-1")).toBeUndefined();
});
```

- [ ] **Step 2: Run the focused test and observe failure**

Run: `pnpm --dir mini-program test:unit -- meal-remote-store.test.ts`
Expected: FAIL because remote store actions are absent.

- [ ] **Step 3: Add remote state/actions while preserving fixture methods**

Add `dataSource`, `nextOffset`, `hasMore`, `requestGeneration`, `loadRemote`, `loadMoreRemote`, `createRemote`, `updateRemote`, `archiveRemote`, `restoreRemote`, `loadArchived`, and `resetUserData`. Increment `requestGeneration` whenever user/date/filter changes; only apply a response whose generation still matches. Keep existing fixture CRUD methods for fixture mode and avoid persisting remote meals into the old fixture storage key.

- [ ] **Step 4: Run Meal Store tests**

Run: `pnpm --dir mini-program test:unit -- meal-store.test.ts meal-remote-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit Meal Store behavior**

```bash
git add mini-program/src/stores/meal-store.ts mini-program/tests/meal-remote-store.test.ts
git commit -m "feat: add remote meal store state"
```

### Task 5: Connect existing manual meal, records and detail pages

**Files:**
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Modify: `mini-program/src/pages/meal-records/index.tsx`
- Modify: `mini-program/src/pages/meal-detail/index.tsx`
- Test: `mini-program/tests/meal-detail-interactions.test.ts`

- [ ] **Step 1: Add failing UI-state tests**

```ts
it("disables manual meal saving while one remote request is pending", () => {
  renderManualMeal({ saveStatus: "saving" });
  expect(screen.getByText("保存这餐").props.disabled).toBe(true);
});

it("shows retry instead of stale fixtures when a remote records request fails", () => {
  renderMealRecords({ dataSource: "supabase", loadingState: "error", errorState: "网络连接不稳定" });
  expect(screen.getByText("重新加载")).toBeTruthy();
});
```

- [ ] **Step 2: Run focused tests and verify failure**

Run: `pnpm --dir mini-program test:unit -- meal-detail-interactions.test.ts meal-remote-store.test.ts`
Expected: FAIL until pages consume remote load/save state.

- [ ] **Step 3: Route existing interactions through remote store actions**

Manual Meal calls `createRemote` only when the repository adapter is Supabase, retains a stable draft id during retry, and navigates using the returned server id. Meal Records loads remote data for the selected date/filter, calls `loadMoreRemote`, and renders existing loading/empty/error components. Meal Detail uses `updateRemote`, `archiveRemote`, and `restoreRemote`; all success messages use the existing feedback host. Do not change card layouts, tabBar, type scale, theme or page copy beyond necessary error/retry/archive labels.

- [ ] **Step 4: Run page and store tests**

Run: `pnpm --dir mini-program test:unit -- meal-detail-interactions.test.ts meal-store.test.ts meal-remote-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit page integration**

```bash
git add mini-program/src/pages/manual-meal/index.tsx mini-program/src/pages/meal-records/index.tsx mini-program/src/pages/meal-detail/index.tsx mini-program/tests
git commit -m "feat: connect manual meal pages to Supabase"
```

### Task 6: Run full development verification and production-safe build

**Files:**
- Test: `supabase/tests/auth_rls_integration.sh`
- Test: `mini-program/tests/meal-repository.test.ts`, `mini-program/tests/meal-remote-store.test.ts`

- [ ] **Step 1: Execute complete automated verification**

Run: `python3 -m unittest discover -s supabase/tests -p 'test_*.py' -v && bash supabase/tests/auth_rls_integration.sh && pnpm --dir mini-program test:unit && pnpm --dir mini-program lint && pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && git diff --check`
Expected: every command exits 0.

- [ ] **Step 2: Execute real development WeChat DevTools verification**

With real-auth and real-backend development flags enabled, create a manual meal with at least two items; retry the same interrupted save and verify one record; edit items and verify server nutritional totals; archive and restore; verify date/type/name filtering and pagination; log out and verify the next protected list request is UNAUTHORIZED. Confirm no token, code or openid appears in formal UI or console logs.

- [ ] **Step 3: Verify production fallback**

Build with production flags and confirm `selectRuntimeAdapter` selects fixtures, the dev Auth Harness is excluded, no service-role/WeChat secret is bundled, and `mini-program/dist/weapp` imports successfully in WeChat Developer Tools.

- [ ] **Step 4: Commit verification artifacts only if changed**

```bash
git add supabase/tests mini-program/tests .env.example
git commit -m "test: verify phase 3a manual meal flow"
```
