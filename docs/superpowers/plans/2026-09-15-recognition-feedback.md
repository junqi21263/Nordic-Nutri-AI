# AI 识别纠错反馈 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在识别结果页增加“识别不准确？”旁路反馈和直接纠错流程，并将反馈安全写入独立的 `recognition_feedback` 表。

**Architecture:** 新增独立的后端反馈 service、POST/PATCH API、数据库迁移和前端 API/context。识别结果页只维护一次纠错会话；现有视觉分析和餐记录保存链路不变，反馈请求失败不阻塞主流程。食物替换/追加复用现有食物目录，份量修改复用现有 portion-adjustment。

**Tech Stack:** Taro 4 + React 18 + Zustand 5；Node.js HTTPS function；CloudBase PostgreSQL；Vitest；Node test runner。

---

### Task 1: 建立数据库迁移和后端 service 契约

**Files:**
- Create: `cloudbase/migrations/20260915170000_recognition_feedback.sql`
- Create: `cloudbase/functions/get-login-ticket/recognition-feedback-data-service.cjs`
- Test: `cloudbase/functions/get-login-ticket/recognition-feedback-data-service.test.mjs`

- [ ] **Step 1: Write the failing service tests**

在测试文件中先覆盖白名单、快照边界、创建和用户隔离更新：

```js
import assert from "node:assert/strict";
import test from "node:test";
import { createRecognitionFeedbackDataService, PublicRecognitionFeedbackError } from "./recognition-feedback-data-service.cjs";

const analysisId = "11111111-1111-4111-8111-111111111111";
const feedbackId = "22222222-2222-4222-8222-222222222222";
const mealId = "33333333-3333-4333-8333-333333333333";

function createDb() {
  const writes = [];
  return {
    writes,
    from(table) {
      const query = {
        select() { return query; },
        eq() { return query; },
        maybeSingle: async () => ({ data: { id: analysisId, user_id: "user-a", provider: "qwen", model: "qwen-vl", model_version: null, image_sha256: "a".repeat(64), normalized_items: [], meal_type: "lunch" }, error: null }),
        insert(payload) { writes.push({ table, payload }); return query; },
        update(payload) { writes.push({ table, payload }); return query; },
        single: async () => ({ data: { id: feedbackId }, error: null }),
      };
      return query;
    },
  };
}

test("creates bounded feedback immediately and keeps meal/correction nullable", async () => {
  const db = createDb();
  const service = createRecognitionFeedbackDataService({ db });
  const result = await service.createFeedback("user-a", {
    analysisId,
    feedbackType: "wrong_food",
    originalResult: { mealType: "lunch", items: [{ name: "鸡胸肉", quantityG: 100 }] },
  });
  assert.equal(result.feedbackId, feedbackId);
  assert.equal(db.writes[0].table, "recognition_feedback");
  assert.equal(db.writes[0].payload.user_id, "user-a");
  assert.equal(db.writes[0].payload.meal_id, null);
  assert.equal(db.writes[0].payload.corrected_result, null);
});

test("rejects unsupported reason and oversized snapshots before writing", async () => {
  const service = createRecognitionFeedbackDataService({ db: { from: () => { throw new Error("must not write"); } } });
  await assert.rejects(() => service.createFeedback("user-a", { feedbackType: "unknown", originalResult: {} }), PublicRecognitionFeedbackError);
  await assert.rejects(() => service.createFeedback("user-a", { feedbackType: "other", originalResult: { note: "x".repeat(10001) } }), PublicRecognitionFeedbackError);
});

test("updates only the owned feedback and validates meal ownership", async () => {
  const db = createDb();
  db.from = (table) => {
    const query = {
      select() { return query; },
      eq() { return query; },
      maybeSingle: async () => ({ data: { id: feedbackId, user_id: "user-a" }, error: null }),
      update(payload) { db.writes.push({ table, payload }); return query; },
      single: async () => ({ data: { id: feedbackId }, error: null }),
    };
    return query;
  };
  const service = createRecognitionFeedbackDataService({ db });
  const result = await service.updateFeedback("user-a", feedbackId, { mealId, correctedResult: { items: [] } });
  assert.equal(result.feedbackId, feedbackId);
  assert.equal(db.writes.at(-1).table, "recognition_feedback");
});
```

- [ ] **Step 2: Run the service tests and verify they fail**

Run: `node --test cloudbase/functions/get-login-ticket/recognition-feedback-data-service.test.mjs`

Expected: FAIL because the new service module and exported factory do not exist.

- [ ] **Step 3: Add the migration**

Create the versioned migration with server-only access:

```sql
create table if not exists public.recognition_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  meal_id uuid references public.meal_records(id) on delete set null,
  analysis_id uuid references public.ai_analysis(id) on delete set null,
  feedback_type text not null check (feedback_type in ('wrong_food', 'missing_food', 'extra_food', 'portion_inaccurate', 'nutrition_data', 'other')),
  original_result jsonb not null,
  corrected_result jsonb,
  model text,
  model_version text,
  image_sha256 char(64) check (image_sha256 is null or image_sha256 ~ '^[0-9a-fA-F]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recognition_feedback_user_created_idx
  on public.recognition_feedback(user_id, created_at desc);

alter table public.recognition_feedback enable row level security;
revoke all on public.recognition_feedback from anon, authenticated;
```

- [ ] **Step 4: Implement bounded normalization and owner checks**

Implement `recognition-feedback-data-service.cjs` with these exported names and limits:

```js
const feedbackTypes = new Set(["wrong_food", "missing_food", "extra_food", "portion_inaccurate", "nutrition_data", "other"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SNAPSHOT_BYTES = 10 * 1024;

class PublicRecognitionFeedbackError extends Error {
  constructor(code = "RECOGNITION_FEEDBACK_INVALID", message = "识别反馈无效") {
    super(message);
    this.code = code;
  }
}

function normalizeSnapshot(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const items = Array.isArray(source.items) ? source.items.slice(0, 20).map((item) => ({
    id: typeof item?.id === "string" ? item.id.slice(0, 100) : null,
    name: typeof item?.name === "string" ? item.name.trim().slice(0, 100) : "",
    quantityG: Number.isFinite(item?.quantityG) ? item.quantityG : null,
    amount: typeof item?.amount === "string" ? item.amount.slice(0, 40) : null,
    calories: Number.isFinite(item?.calories) ? item.calories : null,
    protein: Number.isFinite(item?.protein) ? item.protein : null,
    carbs: Number.isFinite(item?.carbs) ? item.carbs : null,
    fat: Number.isFinite(item?.fat) ? item.fat : null,
    foodId: typeof item?.foodId === "string" ? item.foodId.slice(0, 100) : null,
  })).filter((item) => item.name) : [];
  const snapshot = {
    mealType: typeof source.mealType === "string" ? source.mealType.slice(0, 20) : null,
    title: typeof source.title === "string" ? source.title.slice(0, 120) : null,
    items,
  };
  if (Buffer.byteLength(JSON.stringify(snapshot), "utf8") > MAX_SNAPSHOT_BYTES) throw new PublicRecognitionFeedbackError();
  return snapshot;
}
```

The factory must expose `createFeedback(userId, input)` and `updateFeedback(userId, feedbackId, input)`, insert/update only `recognition_feedback`, and validate `analysisId`/`mealId` through `.eq("user_id", userId).maybeSingle()` before writing. When `analysisId` exists, copy `provider`, `model`, `model_version`, `image_sha256` and a bounded original snapshot from the owned `ai_analysis` row.

- [ ] **Step 5: Run the service tests and verify they pass**

Run: `node --test cloudbase/functions/get-login-ticket/recognition-feedback-data-service.test.mjs`

Expected: PASS.

### Task 2: Wire isolated backend routes without touching vision routes

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js:27,1770,2190-2195,2260-2275,2308-2312,3768-3821`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Add route and runtime wiring tests**

Add tests that assert the runtime exposes `recognitionFeedback` and that POST/PATCH are routed to the injected service while `/vision-analysis` remains unchanged:

```js
test("routes recognition feedback independently from vision analysis", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: () => ({ sub: "user-a" }),
      recognitionFeedback: {
        createFeedback: async (userId, body) => { calls.push(["create", userId, body]); return { feedbackId: "22222222-2222-4222-8222-222222222222" }; },
        updateFeedback: async (userId, id, body) => { calls.push(["update", userId, id, body]); return { feedbackId: id }; },
      },
      productUserExists: async () => true,
    },
  });
  await withServer(server, async (baseUrl) => {
    const create = await fetch(`${baseUrl}/recognition-feedback`, { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ feedbackType: "other", originalResult: { items: [] } }) });
    assert.equal(create.status, 200);
    const patch = await fetch(`${baseUrl}/recognition-feedback/22222222-2222-4222-8222-222222222222`, { method: "PATCH", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ correctedResult: { items: [] } }) });
    assert.equal(patch.status, 200);
  });
  assert.equal(calls.length, 2);
  assert.equal(calls[0][0], "create");
  assert.equal(calls[1][0], "update");
});
```

- [ ] **Step 2: Run the new route test and verify it fails**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL because route parsing and service wiring are not present.

- [ ] **Step 3: Wire the new service and route parser**

Add the import and runtime property:

```js
const { createRecognitionFeedbackDataService, PublicRecognitionFeedbackError } = require("./recognition-feedback-data-service.cjs");
// in createRuntimeService return object
recognitionFeedback: createRecognitionFeedbackDataService({ db }),
```

Add a dedicated parser adjacent to `getFeedbackRoute`:

```js
function getRecognitionFeedbackRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/recognition-feedback") return { operation: "create" };
  const match = path.match(/^\/recognition-feedback\/([0-9a-f-]{36})$/i);
  return match ? { operation: "update", feedbackId: match[1] } : null;
}
```

Register `recognitionFeedbackRoute` in `traceRoutes`, the 404 allowlist, and the generic trace feature as `feedback`, without changing `isVisionRoute`, `getVisionAnalysisStatusRoute`, or the vision handler.

- [ ] **Step 4: Add isolated handlers**

Place the handler before the existing ordinary `feedbackRoute` block:

```js
if (recognitionFeedbackRoute) {
  const session = await authorizeProductRequest(service, req, res);
  if (!session) return;
  if (recognitionFeedbackRoute.operation === "create") {
    if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
    try {
      return sendJson(res, 200, await service.recognitionFeedback.createFeedback(session.sub, await readJsonBody(req, 16 * 1024)));
    } catch (error) {
      if (error instanceof PublicRecognitionFeedbackError) return sendJson(res, 400, { code: error.code });
      console.error("[recognition-feedback] create failed:", error?.code || error?.message || error);
      return sendJson(res, 503, { code: "RECOGNITION_FEEDBACK_SAVE_FAILED" });
    }
  }
  if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
  try {
    return sendJson(res, 200, await service.recognitionFeedback.updateFeedback(session.sub, recognitionFeedbackRoute.feedbackId, await readJsonBody(req, 16 * 1024)));
  } catch (error) {
    if (error instanceof PublicRecognitionFeedbackError) return sendJson(res, 400, { code: error.code });
    console.error("[recognition-feedback] update failed:", error?.code || error?.message || error);
    return sendJson(res, 503, { code: "RECOGNITION_FEEDBACK_UPDATE_FAILED" });
  }
}
```

- [ ] **Step 5: Run backend focused tests**

Run: `node --test cloudbase/functions/get-login-ticket/recognition-feedback-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS, with all existing vision route tests still passing.

### Task 3: Add the frontend API and one-session correction state

**Files:**
- Create: `mini-program/src/api/recognition-feedback-api.ts`
- Create: `mini-program/src/features/recognition-feedback/domain.ts`
- Create: `mini-program/src/stores/recognition-feedback-store.ts`
- Test: `mini-program/tests/recognition-feedback.test.ts`

- [ ] **Step 1: Write failing frontend tests**

```ts
import { describe, expect, it } from "vitest";
import { createRecognitionFeedbackStore } from "../src/stores/recognition-feedback-store";
import { feedbackTypeForReason, snapshotForRecognition } from "../src/features/recognition-feedback/domain";

describe("recognition feedback", () => {
  it("maps every visible reason to a stable backend type", () => {
    expect(feedbackTypeForReason("食物识别错了")).toBe("wrong_food");
    expect(feedbackTypeForReason("少识别了食物")).toBe("missing_food");
    expect(feedbackTypeForReason("多识别了食物")).toBe("extra_food");
    expect(feedbackTypeForReason("份量不准确")).toBe("portion_inaccurate");
    expect(feedbackTypeForReason("营养数据看起来不对")).toBe("nutrition_data");
    expect(feedbackTypeForReason("其他")).toBe("other");
  });

  it("keeps only a bounded meal snapshot", () => {
    const snapshot = snapshotForRecognition({ id: "scan-1", analysisId: "a", title: "午餐", mealType: "lunch", imageKey: "bowl", confidence: 98, insight: "", items: [{ id: "1", name: "鸡胸肉", amount: "100g", calories: 165, protein: 31, carbs: 0, fat: 4 } ] });
    expect(snapshot).toEqual({ mealType: "lunch", title: "午餐", items: [{ id: "1", name: "鸡胸肉", amount: "100g", calories: 165, protein: 31, carbs: 0, fat: 4, foodId: null, quantityG: null }] });
  });

  it("clears one feedback session after leaving the result flow", () => {
    const store = createRecognitionFeedbackStore();
    store.getState().start({ feedbackId: "f", feedbackType: "other", analysisId: null, originalResult: { mealType: "lunch", title: null, items: [] } });
    expect(store.getState().feedbackId).toBe("f");
    store.getState().reset();
    expect(store.getState().feedbackId).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm --dir mini-program test:unit --run mini-program/tests/recognition-feedback.test.ts`

Expected: FAIL because the new module exports do not exist.

- [ ] **Step 3: Implement domain, API, and store**

Use the existing request boundary:

```ts
import type { ScannerMealFixture } from "../scanner/domain";
import type { MealItem } from "../meals/domain";

export type RecognitionFeedbackType = "wrong_food" | "missing_food" | "extra_food" | "portion_inaccurate" | "nutrition_data" | "other";
export const recognitionFeedbackReasons = ["食物识别错了", "少识别了食物", "多识别了食物", "份量不准确", "营养数据看起来不对", "其他"] as const;
export const feedbackTypeForReason = (reason: string): RecognitionFeedbackType => ({ "食物识别错了": "wrong_food", "少识别了食物": "missing_food", "多识别了食物": "extra_food", "份量不准确": "portion_inaccurate", "营养数据看起来不对": "nutrition_data", 其他: "other" }[reason] ?? "other");
export interface RecognitionSnapshot { mealType: string | null; title: string | null; items: Array<Pick<MealItem, "id" | "name" | "amount" | "calories" | "protein" | "carbs" | "fat" | "foodId"> & { quantityG: number | null }> }
export function snapshotForRecognition(meal: ScannerMealFixture): RecognitionSnapshot { return { mealType: meal.mealType, title: meal.title.slice(0, 120), items: meal.items.slice(0, 20).map((item) => ({ id: item.id, name: item.name.slice(0, 100), amount: item.amount.slice(0, 40), calories: item.calories, protein: item.protein, carbs: item.carbs, fat: item.fat, foodId: item.foodId ?? null, quantityG: item.savedNutrition?.quantityG ?? null })) }; }
```

`recognition-feedback-api.ts` must export `createRecognitionFeedback(input)` using `POST /recognition-feedback` and `updateRecognitionFeedback(feedbackId, input)` using `PATCH /recognition-feedback/:feedbackId`, both through `requestProductApi` with a 15-second timeout and nonblocking caller handling.

`recognition-feedback-store.ts` must use `create` like existing stores and expose `start`, `setCorrectedResult`, `setMealId`, `reset`, with `feedbackId`, `analysisId`, `feedbackType`, `originalResult`, `correctedResult`, `mealId`, and `replacementItemId`.

- [ ] **Step 4: Run the frontend test and typecheck**

Run: `pnpm --dir mini-program test:unit --run mini-program/tests/recognition-feedback.test.ts` and `pnpm typecheck:mini-program`

Expected: PASS.

### Task 4: Add the result-page UI and correction routing

**Files:**
- Modify: `mini-program/src/pages/analysis-result/index.tsx:1-505`
- Modify: `mini-program/src/styles/page.scss:7144-7460`
- Modify: `mini-program/src/pages/food-catalog/index.tsx:376-383`
- Modify: `mini-program/src/pages/food-detail/index.tsx:34-42,348-351`
- Modify: `mini-program/src/stores/food-selection-store.ts`
- Modify: `mini-program/src/pages/portion-adjustment/index.tsx:75-150`
- Test: `mini-program/tests/recognition-feedback.test.ts`

- [ ] **Step 1: Add source-level UI tests before implementation**

Extend the test to require the entry text, existing BottomSheet, all six reasons, and the nonblocking save path:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

it("keeps feedback UI beside the recognition result without replacing the save chain", () => {
  const page = readFileSync(resolve(import.meta.dirname, "../src/pages/analysis-result/index.tsx"), "utf8");
  expect(page).toContain("识别不准确？");
  expect(page).toContain("哪里不准确？");
  for (const reason of ["食物识别错了", "少识别了食物", "多识别了食物", "份量不准确", "营养数据看起来不对", "其他"]) expect(page).toContain(reason);
  expect(page).toContain("createRecognitionFeedback");
  expect(page).toContain("feedback API");
  expect(page).toContain("createProductMeal");
});
```

- [ ] **Step 2: Run the source-level test and verify it fails**

Run: `pnpm --dir mini-program test:unit --run mini-program/tests/recognition-feedback.test.ts`

Expected: FAIL because the result page has no recognition feedback entry.

- [ ] **Step 3: Add the first-layer Bottom Sheet**

Import the existing `BottomSheet`, recognition API/domain/store, and add local state:

```tsx
const [feedbackSheetOpen, setFeedbackSheetOpen] = useState(false);
const recognitionFeedback = useRecognitionFeedbackStore();
const beginFeedback = async (reason: string) => {
  setFeedbackSheetOpen(false);
  const feedbackType = feedbackTypeForReason(reason);
  try {
    const { feedbackId } = await createRecognitionFeedback({ analysisId: meal.analysisId ?? null, feedbackType, originalResult: snapshotForRecognition(meal) });
    recognitionFeedback.start({ feedbackId, analysisId: meal.analysisId ?? null, feedbackType, originalResult: snapshotForRecognition(meal) });
  } catch {
    feedback.show({ message: "反馈暂时未保存，请稍后再试", tone: "error" });
  }
  if (feedbackType === "portion_inaccurate") {
    if (portion.meal?.id !== meal.id || portion.editingMealId !== null) portion.start(meal);
    void Taro.navigateTo({ url: "/pages/portion-adjustment/index?recognitionFeedback=1" });
  } else if (feedbackType === "wrong_food" || feedbackType === "missing_food") {
    void Taro.navigateTo({ url: `/pages/food-catalog/index?recognitionFeedback=${feedbackType}` });
  }
};
```

Render the text link under the recognition summary and a `BottomSheet open={feedbackSheetOpen} lockScroll onDismiss={...}` containing all six choices. Do not change the existing `save` function’s analysis or meal API ordering.

- [ ] **Step 4: Implement replacement/addition/deletion context**

Extend `food-selection-store` with `recognitionMode: "replace" | "add" | null`, `recognitionItemId`, `startRecognitionSelection(mode, itemId?)`, and `clearRecognitionSelection`. In catalog inspection, derive the existing manual route and preserve it; for recognition mode use `?mode=recognition-replace` or `?mode=recognition-add`. In food detail, treat either recognition mode as selectable and return the selected catalog item through the existing store.

On result-page show a compact correction state for `extra_food` with a delete control per current item. Deleting updates only `analysisStore.analysis.items` and the corrected snapshot; it does not call the vision API. For `wrong_food`, the selected result item is replaced with the selected catalog item’s name, `foodId`, image and per-100g nutrition scaled to the original item amount. For `missing_food`, append the selected item at its chosen catalog portion.

- [ ] **Step 5: Reuse portion-adjustment and patch after save**

When the portion page is opened with `recognitionFeedback=1`, after the existing save succeeds call the feedback PATCH in a separate `try/catch` with the saved meal id and current adjusted snapshot. If PATCH fails, show a toast but keep the saved meal and celebration unchanged.

When result-page `save` succeeds, call the same PATCH sidecar after `createProductMeal` and `getProductMeals`, using the true returned meal id. Never put the PATCH inside the vision analysis request or make the main save await it for success.

- [ ] **Step 6: Add visual styles using existing tokens**

Add only scoped styles in `page.scss` for the link, reason rows, correction controls, and selected food state. Reuse `$color-forest-green`, `$color-text-secondary`, `$color-divider`, `$space-*`, `$radius-*`, and existing `.bottom-sheet` styles. Do not alter global bottom-sheet animation or add a dependency.

- [ ] **Step 7: Run the UI-focused tests and typecheck**

Run: `pnpm --dir mini-program test:unit --run mini-program/tests/recognition-feedback.test.ts mini-program/tests/food-catalog-detail-routing.test.ts mini-program/tests/portion-draft-store.test.ts` and `pnpm typecheck:mini-program`

Expected: PASS.

### Task 5: Full verification and handoff checks

**Files:**
- Modify: `docs/superpowers/specs/2026-09-15-recognition-feedback-design.md` only if implementation details need a factual update.

- [ ] **Step 1: Run backend focused tests**

Run: `node --test cloudbase/functions/get-login-ticket/recognition-feedback-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run Mini Program focused and existing regression tests**

Run: `pnpm --dir mini-program test:unit --run mini-program/tests/recognition-feedback.test.ts mini-program/tests/meal-recognition-motion.test.ts mini-program/tests/meal-type-selection.test.ts mini-program/tests/food-catalog-detail-routing.test.ts` and `pnpm typecheck:mini-program`

Expected: PASS; no vision animation, result-page save, or food detail routing regression.

- [ ] **Step 3: Build DEV artifacts**

Run: `pnpm --dir mini-program build:weapp:dev` and `pnpm --dir mini-program build:android`.

Expected: both builds complete without TypeScript or bundler errors.

- [ ] **Step 4: Perform DEV runtime checks without claiming unverified gates**

After the migration and function are explicitly deployed to the named DEV environment, verify on Android DEV APK and Mini Program/H5:

1. Complete one recognition and open the result page.
2. Open the Bottom Sheet and select each reason category.
3. Verify food replacement/addition/deletion and portion correction update the local result.
4. Save the meal and check the `recognition_feedback` row has the correct `user_id`, `analysis_id`, `meal_id`, original snapshot and corrected snapshot.
5. Simulate feedback POST/PATCH failure and confirm recognition display and meal save still succeed.

Report APK installation, CloudBase migration/function deployment, authenticated backend row verification, real-device behavior, and visual acceptance as separate gates; mark any unavailable gate `NOT VERIFIED`.

- [ ] **Step 5: Commit only feature files**

Run `git status --short`, confirm the existing logcat and `artifacts/` remain untracked and untouched, then commit only the design/plan and implementation files:

```bash
git add cloudbase/migrations/20260915170000_recognition_feedback.sql cloudbase/functions/get-login-ticket/recognition-feedback-data-service.cjs cloudbase/functions/get-login-ticket/recognition-feedback-data-service.test.mjs cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs mini-program/src/api/recognition-feedback-api.ts mini-program/src/features/recognition-feedback/domain.ts mini-program/src/stores/recognition-feedback-store.ts mini-program/src/pages/analysis-result/index.tsx mini-program/src/pages/food-catalog/index.tsx mini-program/src/pages/food-detail/index.tsx mini-program/src/pages/portion-adjustment/index.tsx mini-program/src/stores/food-selection-store.ts mini-program/src/styles/page.scss mini-program/tests/recognition-feedback.test.ts docs/superpowers/specs/2026-09-15-recognition-feedback-design.md docs/superpowers/plans/2026-09-15-recognition-feedback.md
git commit -m "feat: add recognition correction feedback"
```

