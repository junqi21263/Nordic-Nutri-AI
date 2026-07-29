import assert from "node:assert/strict";
import test from "node:test";
import { buildFoodImagePrompt, MAX_PROMPT_CHARS } from "./food-image-prompts.cjs";
import { createHunyuanImageService, HunyuanImageError, resolveSize } from "./hunyuan-image-service.cjs";
import foodImageJobModule from "./food-image-job-service.cjs";
import { transformFoodCardImage } from "./food-image-service.cjs";

const { createFoodImageJobService, FoodImageJobError, shouldTriggerWorker } = foodImageJobModule;

test("buildFoodImagePrompt stays within the 500-char Hunyuan limit", () => {
  const prompt = buildFoodImagePrompt({
    foodNameZh: "水煮鸡胸肉",
    foodNameEn: "Boiled chicken breast",
    category: "肉禽",
    cookingMethod: "水煮",
    servingDescription: "100g",
    extraPrompt: "鸡胸肉必须是自然白色，没有煎痕烤痕酱汁，不增加米饭蔬菜",
  });
  assert.ok(prompt.includes("水煮鸡胸肉"));
  assert.ok(prompt.includes("北欧"));
  assert.ok(prompt.length <= MAX_PROMPT_CHARS);
});

test("resolveSize rejects unsupported 1024x768 and falls back to landscape", () => {
  assert.equal(resolveSize("1024x768"), "1280x720");
  assert.equal(resolveSize("1280x720"), "1280x720");
});

test("hunyuan generateOne retries empty results then fails", async () => {
  let calls = 0;
  const service = createHunyuanImageService({
    modelName: "HY-Image-3.0-Plus-4090-Tob-v1.0",
    maxRetries: 2,
    generateImageImpl: async () => {
      calls += 1;
      return { data: [] };
    },
  });
  await assert.rejects(
    () => service.generateOne({ foodNameZh: "水煮鸡胸肉", cookingMethod: "水煮" }),
    (err) => err instanceof HunyuanImageError && err.code === "HY_IMAGE_EMPTY_RESULT",
  );
  assert.equal(calls, 2);
});

test("hunyuan download validates mime type", async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9, ...Buffer.alloc(2000, 1)]);
  const service = createHunyuanImageService({
    generateImageImpl: async () => ({ data: [{ url: "https://example.com/a.jpg" }] }),
    downloadImpl: async () => ({ buffer: jpeg, contentType: "image/jpeg", size: jpeg.length }),
  });
  const downloaded = await service.downloadGeneratedImage("https://example.com/a.jpg");
  assert.equal(downloaded.mimeType, "image/jpeg");
});

test("createJob rejects non-admin and duplicate active jobs", async () => {
  const jobs = [];
  const profiles = [];
  const db = {
    from(table) {
      if (table === "food_image_usage_daily") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { generated_count: 0 }, error: null }) }) }),
          insert: async () => ({ data: null, error: null }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === "food_image_jobs") {
        return {
          select: () => {
            const query = { eq: () => query, in: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: jobs[0] || null, error: null }) };
            return query;
          },
          insert: (payload) => ({
            select: () => ({
              maybeSingle: async () => {
                const row = { id: "job-1", ...payload, created_at: new Date().toISOString() };
                jobs.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === "food_image_visual_profiles") {
        return {
          select: () => {
            const query = { eq: () => query, maybeSingle: async () => ({ data: profiles[0] || null, error: null }) };
            return query;
          },
          insert: (payload) => ({ select: () => ({ maybeSingle: async () => { const row = { id: "profile-1", ...payload }; profiles.push(row); return { data: row, error: null }; } }) }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === "food_images") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                limit: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      if (table === "foods") {
        return { update: () => ({ eq: async () => ({ data: null, error: null }) }) };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const repository = {
    async isAdmin(userId) { return userId === "admin"; },
    async getFoodById(id) {
      return {
        id,
        nameZh: "水煮鸡胸肉",
        nameEn: "Boiled chicken breast",
        sourceId: "fixture-chicken",
        category: { code: "meat", nameZh: "肉禽" },
        primaryImageId: null,
      };
    },
  };

  const service = createFoodImageJobService({
    db,
    repository,
    hunyuan: { modelName: "HY-Image-3.0-Plus-4090-Tob-v1.0" },
    imageService: {},
    config: { generationEnabled: true, dailyLimit: 100 },
  });

  await assert.rejects(
    () => service.createJob("user", { foodId: "food-1" }),
    (err) => err instanceof FoodImageJobError && err.code === "FORBIDDEN",
  );

  const created = await service.createJob("admin", { foodId: "food-1", candidateCount: 1 });
  assert.equal(created.id, "job-1");
  assert.equal(created.candidateCount, 1);
  assert.equal(created.visualProfileKey, "cooked_plain");

  await assert.rejects(
    () => service.createJob("admin", { foodId: "food-1", candidateCount: 1 }),
    (err) => err instanceof FoodImageJobError && err.code === "FOOD_IMAGE_JOB_ACTIVE",
  );
});

test("a ready raw chicken-breast profile does not block a separate cooked profile", async () => {
  const profiles = [{
    id: "profile-raw",
    food_id: "food-owner",
    profile_key: "raw",
    primary_image_id: "image-raw",
    is_default: true,
  }];
  const insertedJobs = [];
  const db = {
    from(table) {
      if (table === "food_image_usage_daily") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { generated_count: 0 }, error: null }) }) }),
          insert: async () => ({ data: null, error: null }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === "food_image_visual_profiles") {
        return {
          select: () => {
            const filters = {};
            const query = {
              eq(column, value) { filters[column] = value; return query; },
              maybeSingle: async () => ({
                data: profiles.find((profile) => profile.food_id === filters.food_id && profile.profile_key === filters.profile_key) || null,
                error: null,
              }),
            };
            return query;
          },
          insert: (payload) => ({
            select: () => ({
              maybeSingle: async () => {
                const row = { id: "profile-cooked", ...payload };
                profiles.push(row);
                return { data: row, error: null };
              },
            }),
          }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === "food_images") {
        return {
          select: () => {
            const filters = {};
            const query = {
              eq(column, value) { filters[column] = value; return query; },
              limit: async () => ({
                data: filters.visual_profile_id === "profile-raw"
                  ? [{ id: "image-raw", is_primary: true, review_status: "approved", status: "ready" }]
                  : [],
                error: null,
              }),
            };
            return query;
          },
        };
      }
      if (table === "food_image_jobs") {
        return {
          select: () => {
            const query = { eq: () => query, in: () => query, order: () => query, limit: () => query, maybeSingle: async () => ({ data: null, error: null }) };
            return query;
          },
          insert: (payload) => ({
            select: () => ({
              maybeSingle: async () => {
                const row = { id: "job-cooked", ...payload };
                insertedJobs.push(row);
                return { data: row, error: null };
              },
            }),
          }),
        };
      }
      if (table === "foods") return { update: () => ({ eq: async () => ({ data: null, error: null }) }) };
      throw new Error(`unexpected table ${table}`);
    },
  };
  const repository = {
    async isAdmin(userId) { return userId === "admin"; },
    async getFoodById() {
      return {
        id: "nutrition-variant-cooked",
        imageOwnerFoodId: "food-owner",
        visualProfileKey: "raw",
        nameZh: "鸡胸肉",
        nameEn: "Chicken breast",
        category: { code: "meat", nameZh: "肉禽" },
      };
    },
  };
  const service = createFoodImageJobService({
    db, repository, hunyuan: { modelName: "test" }, imageService: {}, config: { generationEnabled: true },
  });

  await assert.rejects(
    () => service.createJob("admin", { foodId: "nutrition-variant-cooked", visualProfileKey: "raw" }),
    (error) => error instanceof FoodImageJobError && error.code === "FOOD_IMAGE_ALREADY_READY",
  );
  const created = await service.createJob("admin", {
    foodId: "nutrition-variant-cooked",
    visualProfileKey: "cooked_plain",
    deferWorker: true,
  });
  assert.equal(created.visualProfileKey, "cooked_plain");
  assert.equal(insertedJobs[0].food_id, "food-owner");
  assert.equal(insertedJobs[0].visual_profile_id, "profile-cooked");
  assert.equal(profiles.find((profile) => profile.id === "profile-cooked").is_default, false);
});

test("createBatch caps at 100 food ids", async () => {
  const service = createFoodImageJobService({
    db: { from: () => ({}) },
    repository: { async isAdmin() { return true; } },
    hunyuan: { modelName: "m" },
    imageService: {},
    config: { generationEnabled: true },
  });
  const ids = Array.from({ length: 101 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  await assert.rejects(
    () => service.createBatch("admin", { foodIds: ids }),
    (err) => err instanceof FoodImageJobError && err.code === "FOOD_IMAGE_BATCH_TOO_LARGE",
  );
});

test("transformFoodCardImage falls back without sharp", async () => {
  const buffer = Buffer.alloc(2048, 2);
  const result = await transformFoodCardImage(buffer, null);
  assert.equal(result.transformed, false);
  assert.equal(result.detail, buffer);
});

test("batch-owned jobs defer the legacy fire-and-forget worker", () => {
  assert.equal(shouldTriggerWorker({ deferWorker: true }), false);
  assert.equal(shouldTriggerWorker({}), true);
});

test("approving a batch candidate completes its matching batch item", async () => {
  const writes = [];
  const image = {
    id: "image-1",
    food_id: "food-1",
    job_id: "job-1",
    quality_score: 92,
  };
  const db = {
    from(table) {
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => ({ data: table === "food_images" ? image : null, error: null }),
              };
            },
          };
        },
        update(payload) {
          const write = { table, payload, filters: [] };
          writes.push(write);
          const query = {
            eq(column, value) {
              write.filters.push([column, value]);
              return query;
            },
          };
          return query;
        },
      };
    },
  };
  const service = createFoodImageJobService({
    db,
    repository: { async isAdmin(userId) { return userId === "admin"; } },
    hunyuan: { modelName: "test" },
    imageService: {},
    config: { generationEnabled: true },
  });

  const result = await service.approveImage("admin", "image-1");
  assert.deepEqual(result, { imageId: "image-1", foodId: "food-1", jobId: "job-1", visualProfileId: null, approved: true });
  assert.deepEqual(
    writes.find((write) => write.table === "food_image_batch_items"),
    {
      table: "food_image_batch_items",
      payload: { status: "completed", error_code: null, error_message: null, next_retry_at: null },
      filters: [["job_id", "job-1"]],
    },
  );
});

test("rejecting a batch candidate records the review reason for one retry", async () => {
  const writes = [];
  const image = { id: "image-2", food_id: "food-2", job_id: "job-2", is_primary: false };
  const db = {
    from(table) {
      return {
        select() {
          return { eq() { return { maybeSingle: async () => ({ data: table === "food_images" ? image : null, error: null }) }; } };
        },
        update(payload) {
          const write = { table, payload, filters: [] };
          writes.push(write);
          const query = { eq(column, value) { write.filters.push([column, value]); return query; } };
          return query;
        },
      };
    },
  };
  const service = createFoodImageJobService({
    db,
    repository: { async isAdmin(userId) { return userId === "admin"; } },
    hunyuan: { modelName: "test" },
    imageService: {},
    config: { generationEnabled: true },
  });

  const result = await service.rejectImage("admin", "image-2", { reason: "主体不像鸡蛋，保留完整水煮蛋切面" });
  assert.deepEqual(result, { imageId: "image-2", foodId: "food-2", jobId: "job-2", rejected: true });

  assert.deepEqual(
    writes.find((write) => write.table === "food_image_batch_items"),
    {
      table: "food_image_batch_items",
      payload: {
        status: "needs_retry",
        last_image_id: "image-2",
        retry_reason: "主体不像鸡蛋，保留完整水煮蛋切面",
        error_code: "FOOD_IMAGE_REJECTED",
        error_message: "主体不像鸡蛋，保留完整水煮蛋切面",
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      },
      filters: [["job_id", "job-2"]],
    },
  );
});
