import assert from "node:assert/strict";
import test from "node:test";

import batchModule from "./food-image-batch-service.cjs";

const {
  FoodImageBatchError,
  normalizeBatchPayload,
  normalizeCategoryBatchPayload,
  normalizeFoodIds,
  isClaimableBatchItemStatus,
  resolveBatchCompletionStatus,
  createFoodImageBatchService,
} = batchModule;

test("normalizeBatchPayload keeps the requested visual profile for a batch", () => {
  const payload = normalizeBatchPayload({
    name: "鸡胸肉熟制图",
    visualProfileKey: "cooked_plain",
  });
  assert.equal(payload.visualProfileKey, "cooked_plain");
  assert.equal(payload.selection.visualProfileKey, "cooked_plain");
});

test("normalizeBatchPayload forces one candidate and bounds worker settings", () => {
  const payload = normalizeBatchPayload({
    name: "  首轮样本  ",
    candidateCount: 3,
    concurrency: 99,
    maxAttempts: 9,
  });
  assert.equal(payload.name, "首轮样本");
  assert.equal(payload.candidateCount, 1);
  assert.equal(payload.concurrency, 5);
  assert.equal(payload.maxAttempts, 3);
});

test("normalizeFoodIds de-duplicates UUID-like IDs and rejects an empty batch", () => {
  assert.deepEqual(normalizeFoodIds(["food-1", "food-1", "food-2"]), ["food-1", "food-2"]);
  assert.throws(
    () => normalizeFoodIds([]),
    (error) => error instanceof FoodImageBatchError && error.code === "FOOD_IMAGE_BATCH_SELECTION_EMPTY",
  );
});

test("retryable batch items remain claimable until the attempt budget is exhausted", () => {
  assert.equal(isClaimableBatchItemStatus("pending"), true);
  assert.equal(isClaimableBatchItemStatus("needs_retry"), true);
  assert.equal(isClaimableBatchItemStatus("needs_review"), false);
  assert.equal(isClaimableBatchItemStatus("failed"), false);
});

test("a batch remains active while generated candidates are waiting for review", () => {
  assert.equal(
    resolveBatchCompletionStatus({ status: "running" }, { needs_review: 20 }),
    "running",
  );
  assert.equal(
    resolveBatchCompletionStatus({ status: "running" }, { completed: 19, failed: 1 }),
    "completed_with_errors",
  );
});

test("normalizeCategoryBatchPayload requires one category and bounds its requested count", () => {
  assert.throws(
    () => normalizeCategoryBatchPayload({ count: 20 }),
    (error) => error instanceof FoodImageBatchError && error.code === "FOOD_IMAGE_BATCH_CATEGORY_REQUIRED",
  );
  assert.deepEqual(normalizeCategoryBatchPayload({ categoryId: " category-1 ", count: 999, name: "  蔬菜首批  " }), {
    categoryId: "category-1",
    count: 100,
    name: "蔬菜首批",
    concurrency: 2,
    maxAttempts: 3,
    visualProfileKey: "auto",
  });
});

test("previewCategory forwards the visual profile and reports server-side ready exclusions", async () => {
  const repository = {
    isAdmin: async (userId) => userId === "admin-1",
    listBatchImageCandidates: async ({ categoryId, count, visualProfileKey }) => {
      assert.equal(categoryId, "category-vegetables");
      assert.equal(count, 20);
      assert.equal(visualProfileKey, "fresh");
      return {
        total: 34,
        excludedReadyCount: 2,
        items: [
          { id: "food-1", name_zh: "番茄" },
          { id: "food-2", name_zh: "西兰花" },
        ],
      };
    },
  };
  const service = createFoodImageBatchService({ db: {}, repository, jobs: {} });

  const preview = await service.previewCategory("admin-1", {
    categoryId: "category-vegetables",
    count: 20,
    visualProfileKey: "fresh",
  });

  assert.deepEqual(preview, {
    categoryId: "category-vegetables",
    requestedCount: 20,
    selectableCount: 34,
    selectedCount: 2,
    excludedReadyCount: 2,
    visualProfileKey: "fresh",
    foods: [
      { id: "food-1", nameZh: "番茄" },
      { id: "food-2", nameZh: "西兰花" },
    ],
  });
});

test("trusted batch dispatch creates the image job as the batch creator", async () => {
  const batch = {
    id: "batch-1",
    status: "running",
    created_by: "admin-creator",
    concurrency: 1,
    max_attempts: 3,
  };
  const item = {
    id: "item-1",
    batch_id: batch.id,
    food_id: "food-1",
    status: "pending",
    attempt_count: 0,
    retry_reason: null,
  };
  const db = {
    from(table) {
      if (table === "food_image_batches") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: batch, error: null }) }) }),
          update: (patch) => {
            Object.assign(batch, patch);
            return { eq: async () => ({ data: batch, error: null }) };
          },
        };
      }
      if (table === "food_image_batch_items") {
        return {
          select: (columns) => {
            if (columns === "status") return { eq: async () => ({ data: [{ status: item.status }], error: null }) };
            const query = {
              eq: () => query,
              in: () => query,
              or: () => query,
              order: () => query,
              limit: () => query,
              maybeSingle: async () => ({ data: item.status === "pending" ? item : null, error: null }),
            };
            return query;
          },
          update: (patch) => {
            Object.assign(item, patch);
            const query = {
              eq: () => query,
              select: () => ({ maybeSingle: async () => ({ data: item, error: null }) }),
            };
            return query;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const createdBy = [];
  const service = createFoodImageBatchService({
    db,
    repository: {
      async getFoodById(id) {
        return { id, nameZh: "鸡胸肉", nameEn: "chicken breast", category: { nameZh: "肉禽" } };
      },
    },
    jobs: {
      async createJob(userId) {
        createdBy.push(userId);
        return { id: "job-1" };
      },
      async processQueue() {
        return { results: [{ generated: 1 }] };
      },
    },
  });

  const result = await service.processNextTrusted(batch.id);

  assert.equal(result.processed, 1);
  assert.deepEqual(createdBy, ["admin-creator"]);
  assert.equal(item.status, "needs_review");
});

test("retries the exact rejected batch item immediately and reopens a completed batch", async () => {
  const batch = { id: "batch-1", status: "completed", created_by: "admin", concurrency: 1, max_attempts: 3 };
  const item = { id: "item-1", batch_id: batch.id, food_id: "food-1", job_id: "old-job", status: "needs_retry", attempt_count: 1, retry_reason: "主体偏肥，请保留瘦肉纹理" };
  const db = {
    from(table) {
      if (table === "food_image_batches") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: batch, error: null }) }) }),
        update: (patch) => ({ eq: async () => { Object.assign(batch, patch); return { data: batch, error: null }; } }),
      };
      if (table === "food_image_batch_items") return {
        select: (columns) => {
          if (columns === "status") return { eq: async () => ({ data: [{ status: item.status }], error: null }) };
          const query = {
            eq: () => query, in: () => query, or: () => query, order: () => query, limit: () => query,
            maybeSingle: async () => ({ data: item.status === "needs_retry" || item.status === "generating" ? item : null, error: null }),
          };
          return query;
        },
        update: (patch) => {
          Object.assign(item, patch);
          const query = { eq: () => query, select: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) };
          return query;
        },
      };
      throw new Error(`unexpected table ${table}`);
    },
  };
  const created = [];
  const service = createFoodImageBatchService({
    db,
    repository: {
      isAdmin: async (userId) => userId === "admin",
      getFoodById: async () => ({ id: "food-1", nameZh: "瘦牛肉", nameEn: "lean beef", category: { nameZh: "肉禽" } }),
    },
    jobs: {
      createJob: async (userId, input) => { created.push({ userId, input }); return { id: "retry-job" }; },
      processQueue: async () => ({ results: [{ generated: 1 }] }),
    },
  });

  const result = await service.retryRejectedJob("admin", "old-job");

  assert.equal(result.retryScheduled, true);
  assert.equal(result.jobId, "retry-job");
  assert.equal(batch.status, "running");
  assert.equal(item.status, "needs_review");
  assert.equal(item.attempt_count, 2);
  assert.match(created[0].input.extraPrompt, /主体偏肥/);
});

test("trusted dispatch falls back to resolveAdminExecutor when created_by is missing", async () => {
  const batch = {
    id: "batch-1",
    status: "running",
    created_by: null,
    concurrency: 1,
    max_attempts: 3,
  };
  const item = {
    id: "item-1",
    batch_id: batch.id,
    food_id: "food-1",
    status: "pending",
    attempt_count: 0,
    retry_reason: null,
  };
  const db = {
    from(table) {
      if (table === "food_image_batches") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: batch, error: null }) }) }),
          update: (patch) => {
            Object.assign(batch, patch);
            return { eq: async () => ({ data: batch, error: null }) };
          },
        };
      }
      if (table === "food_image_batch_items") {
        return {
          select: (columns) => {
            if (columns === "status") return { eq: async () => ({ data: [{ status: item.status }], error: null }) };
            const query = {
              eq: () => query,
              in: () => query,
              or: () => query,
              order: () => query,
              limit: () => query,
              maybeSingle: async () => ({ data: item.status === "pending" ? item : null, error: null }),
            };
            return query;
          },
          update: (patch) => {
            Object.assign(item, patch);
            const query = {
              eq: () => query,
              select: () => ({ maybeSingle: async () => ({ data: item, error: null }) }),
            };
            return query;
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  const createdBy = [];
  const service = createFoodImageBatchService({
    db,
    repository: {
      async getFoodById(id) {
        return { id, nameZh: "澳大利亚羊腿肉", nameEn: "Australian lamb", category: { nameZh: "肉禽" } };
      },
    },
    jobs: {
      async createJob(userId) {
        createdBy.push(userId);
        return { id: "job-fallback" };
      },
      async processQueue() {
        return { results: [{ generated: 1 }] };
      },
    },
    resolveAdminExecutor: async () => "admin-console-actor",
  });

  const result = await service.processNextTrusted(batch.id);

  assert.equal(result.processed, 1);
  assert.deepEqual(createdBy, ["admin-console-actor"]);
  assert.equal(batch.created_by, "admin-console-actor");
  assert.equal(item.status, "needs_review");
});

test("retryFailedItem reopens executor-missing failures without a job id", async () => {
  const batch = { id: "batch-1", status: "running", created_by: null, concurrency: 1, max_attempts: 3 };
  const item = {
    id: "item-1",
    batch_id: batch.id,
    food_id: "food-1",
    job_id: null,
    status: "failed",
    attempt_count: 3,
    error_code: "FOOD_IMAGE_BATCH_EXECUTOR_MISSING",
    error_message: "batch has no administrator executor",
  };
  const db = {
    from(table) {
      if (table === "food_image_batches") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: batch, error: null }) }) }),
        update: (patch) => ({ eq: async () => { Object.assign(batch, patch); return { data: batch, error: null }; } }),
      };
      if (table === "food_image_batch_items") return {
        select: (columns) => {
          if (columns === "status") return { eq: async () => ({ data: [{ status: item.status }], error: null }) };
          const query = {
            eq: () => query, in: () => query, or: () => query, order: () => query, limit: () => query,
            maybeSingle: async () => ({
              data: item.status === "needs_retry" || item.status === "generating" || item.status === "failed" ? item : null,
              error: null,
            }),
          };
          return query;
        },
        update: (patch) => {
          Object.assign(item, patch);
          const query = { eq: () => query, select: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) };
          return query;
        },
      };
      throw new Error(`unexpected table ${table}`);
    },
  };
  const created = [];
  const service = createFoodImageBatchService({
    db,
    repository: {
      isAdmin: async (userId) => userId === "admin",
      getFoodById: async () => ({ id: "food-1", nameZh: "澳大利亚羊腿肉", category: { nameZh: "肉禽" } }),
    },
    jobs: {
      createJob: async (userId) => { created.push(userId); return { id: "new-job" }; },
      processQueue: async () => ({ results: [{ generated: 1 }] }),
    },
    resolveAdminExecutor: async () => "admin-console-actor",
  });

  const result = await service.retryFailedItem("admin", "item-1");

  assert.equal(result.retryScheduled, true);
  assert.equal(result.jobId, "new-job");
  assert.equal(item.status, "needs_review");
  assert.equal(item.attempt_count, 1);
  assert.deepEqual(created, ["admin"]);
});

test("retryFailedItem unlocks a stuck generating item and processes it again", async () => {
  const batch = { id: "batch-1", status: "running", created_by: "admin", concurrency: 1, max_attempts: 3 };
  const item = {
    id: "item-stuck",
    batch_id: batch.id,
    food_id: "food-1",
    job_id: "stale-job",
    status: "generating",
    attempt_count: 0,
    locked_at: "2026-08-03T04:00:00.000Z",
    locked_by: "cloud-scheduled-worker",
    error_code: null,
    error_message: null,
  };
  let unlockedFromGenerating = false;
  const db = {
    from(table) {
      if (table === "food_image_batches") return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: batch, error: null }) }) }),
        update: (patch) => ({ eq: async () => { Object.assign(batch, patch); return { data: batch, error: null }; } }),
      };
      if (table === "food_image_batch_items") return {
        select: (columns) => {
          if (columns === "status") return { eq: async () => ({ data: [{ status: item.status }], error: null }) };
          let statusFilter = null;
          const query = {
            eq: () => query,
            in: (column, values) => {
              if (column === "status") statusFilter = values;
              return query;
            },
            or: () => query,
            order: () => query,
            limit: () => query,
            maybeSingle: async () => {
              if (statusFilter && !statusFilter.includes(item.status)) return { data: null, error: null };
              return { data: item, error: null };
            },
          };
          return query;
        },
        update: (patch) => {
          if (item.status === "generating" && patch.status === "needs_retry") unlockedFromGenerating = true;
          Object.assign(item, patch);
          const query = { eq: () => query, select: () => ({ maybeSingle: async () => ({ data: item, error: null }) }) };
          return query;
        },
      };
      throw new Error(`unexpected table ${table}`);
    },
  };
  const created = [];
  const service = createFoodImageBatchService({
    db,
    repository: {
      isAdmin: async (userId) => userId === "admin",
      getFoodById: async () => ({ id: "food-1", nameZh: "混合肉香肠", category: { nameZh: "肉禽" } }),
    },
    jobs: {
      createJob: async (userId) => { created.push(userId); return { id: "fresh-job" }; },
      processQueue: async () => ({ results: [{ generated: 1 }] }),
    },
  });

  const result = await service.retryFailedItem("admin", "item-stuck");

  assert.equal(unlockedFromGenerating, true);
  assert.equal(result.retryScheduled, true);
  assert.equal(result.jobId, "fresh-job");
  assert.equal(item.status, "needs_review");
  assert.equal(item.locked_at, null);
  assert.equal(item.locked_by, null);
  assert.deepEqual(created, ["admin"]);
});

test("previewCategory falls back to localized English food names when name_zh is missing", async () => {
  const repository = {
    isAdmin: async () => true,
    listBatchImageCandidates: async () => ({
      total: 2,
      items: [
        { id: "food-1", name_zh: null, name_en: "Beef, NFS" },
        { id: "food-2", name_zh: null, name_en: "Chicken breast" },
      ],
    }),
  };
  const service = createFoodImageBatchService({ db: {}, repository, jobs: {} });
  const preview = await service.previewCategory("admin-1", { categoryId: "c-meat", count: 20 });
  assert.deepEqual(preview.foods, [
    { id: "food-1", nameZh: "牛肉" },
    { id: "food-2", nameZh: "Chicken breast" },
  ]);
});
