import assert from "node:assert/strict";
import test from "node:test";

import {
  createUserImageOpsService,
  PublicUserImageError,
  isFoodsPath,
} from "./user-image-ops-service.cjs";

function makeThenable(result) {
  const value = typeof result === "function" ? result : () => result;
  const chain = {
    select() { return chain; },
    eq() { return chain; },
    neq() { return chain; },
    not() { return chain; },
    in() { return chain; },
    order() { return chain; },
    range() { return chain; },
    limit() { return chain; },
    update() { return chain; },
    maybeSingle: async () => value(),
    single: async () => value(),
    then(resolve, reject) {
      return Promise.resolve(value()).then(resolve, reject);
    },
  };
  return chain;
}

test("isFoodsPath rejects catalog prefixes", () => {
  assert.equal(isFoodsPath("foods/abc/hash/primary.webp"), true);
  assert.equal(isFoodsPath("cloud://env/foods/abc/x.webp"), true);
  assert.equal(isFoodsPath("food-images/u1/a.jpg"), false);
});

test("list merges kinds, dedupes by path preferring vision, and paginates", async () => {
  const now = new Date().toISOString();
  const older = new Date(Date.now() - 60_000).toISOString();
  const db = {
    from(table) {
      if (table === "ai_analysis") {
        return makeThenable({
          data: [
            { id: "v1", user_id: "u1", image_path: "cloud://shared", status: "succeeded", review_status: "pending", raw_recognition: { mealName: "粥" }, created_at: now },
          ],
          count: 1,
          error: null,
        });
      }
      if (table === "content_moderation_flags") {
        return makeThenable({ data: [], count: 0, error: null });
      }
      if (table === "profiles") {
        return makeThenable({
          data: [
            { id: "u2", avatar_path: "cloud://avatar-u2", updated_at: older, created_at: older },
            { id: "u3", avatar_path: "default:food-1", updated_at: older, created_at: older },
          ],
          error: null,
        });
      }
      if (table === "uploaded_assets") {
        return makeThenable({
          data: [
            { id: "a1", user_id: "u1", object_path: "cloud://shared", status: "uploaded", created_at: older },
            { id: "a2", user_id: "u1", object_path: "cloud://asset-only", status: "uploaded", created_at: older },
          ],
          count: 2,
          error: null,
        });
      }
      if (table === "meal_records") {
        return makeThenable({ data: [], error: null });
      }
      throw new Error(`unexpected ${table}`);
    },
  };

  const service = createUserImageOpsService({
    db,
    deleteFiles: async () => {},
    resolveTempFileUrls: async (paths) => new Map(paths.map((p) => [p, `https://tmp/${p}`])),
  });

  const result = await service.list({ kind: "all", page: 1, pageSize: 10 });
  assert.equal(result.kind, "all");
  assert.equal(result.totalApproximate, true);
  const kindsByPath = Object.fromEntries(result.items.map((item) => [item.imagePath, item.kind]));
  assert.equal(kindsByPath["cloud://shared"], "vision");
  assert.equal(kindsByPath["cloud://avatar-u2"], "avatar");
  assert.equal(kindsByPath["cloud://asset-only"], "asset");
  assert.equal(result.items.some((item) => item.imagePath === "default:food-1"), false);
  assert.ok(result.items.every((item) => item.imageUrl || item.kind === "avatar"));
});

test("list filters by userId and marks meal-linked images protected", async () => {
  const db = {
    from(table) {
      if (table === "ai_analysis") {
        return makeThenable({
          data: [
            { id: "v1", user_id: "11111111-1111-1111-1111-111111111111", image_path: "cloud://meal-linked", status: "saved", review_status: "reviewed", raw_recognition: null, created_at: "2026-01-01T00:00:00.000Z" },
          ],
          count: 1,
          error: null,
        });
      }
      if (table === "meal_records") {
        return makeThenable({ data: [{ image_path: "cloud://meal-linked" }], error: null });
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  const service = createUserImageOpsService({
    db,
    deleteFiles: async () => {},
    resolveTempFileUrls: async () => new Map([["cloud://meal-linked", "https://x"]]),
  });
  const result = await service.list({
    kind: "vision",
    userId: "11111111-1111-1111-1111-111111111111",
    page: 1,
    pageSize: 20,
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].protected, true);
  assert.match(result.items[0].protectReason, /餐食/);
});

test("delete vision refuses meal-linked paths", async () => {
  const deleted = [];
  const db = {
    from(table) {
      if (table === "ai_analysis") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { id: "v1", image_path: "cloud://keep", user_id: "u1" },
                    error: null,
                  }),
                };
              },
            };
          },
          update() {
            return { eq: async () => ({ error: null }) };
          },
        };
      }
      if (table === "meal_records") {
        return makeThenable({ data: [{ id: "m1" }], error: null });
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  const service = createUserImageOpsService({
    db,
    deleteFiles: async ({ cloudPaths }) => { deleted.push(...cloudPaths); },
  });
  await assert.rejects(
    () => service.delete({ kind: "vision", id: "11111111-1111-1111-1111-111111111111" }),
    (error) => error instanceof PublicUserImageError && error.code === "USER_IMAGE_PROTECTED",
  );
  assert.deepEqual(deleted, []);
});

test("delete vision clears path and marks asset deleted", async () => {
  const deleted = [];
  const updates = [];
  const analysisId = "22222222-2222-2222-2222-222222222222";
  const db = {
    from(table) {
      if (table === "ai_analysis") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { id: analysisId, image_path: "cloud://orphan", user_id: "u1" },
                    error: null,
                  }),
                };
              },
            };
          },
          update(payload) {
            return {
              eq(key, id) {
                updates.push({ table, payload, id });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "meal_records") {
        return makeThenable({ data: [], error: null });
      }
      if (table === "uploaded_assets") {
        return {
          update(payload) {
            return {
              eq(key, value) {
                updates.push({ table, payload, key, value });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  const service = createUserImageOpsService({
    db,
    deleteFiles: async ({ cloudPaths }) => { deleted.push(...cloudPaths); },
  });
  const result = await service.delete({ kind: "vision", id: analysisId });
  assert.equal(result.deleted, true);
  assert.deepEqual(deleted, ["cloud://orphan"]);
  assert.ok(updates.some((entry) => entry.table === "ai_analysis" && entry.payload.image_path === null));
  assert.ok(updates.some((entry) => entry.table === "uploaded_assets" && entry.payload.status === "deleted"));
});

test("delete avatar resets default sentinel and skips cloud delete for data URLs", async () => {
  const deleted = [];
  const updates = [];
  const userId = "33333333-3333-3333-3333-333333333333";
  const db = {
    from(table) {
      if (table === "profiles") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { id: userId, avatar_path: "data:image/png;base64,aaa" },
                    error: null,
                  }),
                };
              },
            };
          },
          update(payload) {
            return {
              eq(key, id) {
                updates.push({ payload, id });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  const service = createUserImageOpsService({
    db,
    deleteFiles: async ({ cloudPaths }) => { deleted.push(...cloudPaths); },
  });
  const result = await service.delete({ kind: "avatar", id: userId });
  assert.equal(result.deleted, true);
  assert.deepEqual(deleted, []);
  assert.match(updates[0].payload.avatar_path, /^default:food-[1-8]$/);
});

test("delete asset refuses when still referenced by ai_analysis", async () => {
  const assetId = "44444444-4444-4444-4444-444444444444";
  const db = {
    from(table) {
      if (table === "uploaded_assets") {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: async () => ({
                    data: { id: assetId, object_path: "cloud://still-used", user_id: "u1", status: "uploaded" },
                    error: null,
                  }),
                };
              },
            };
          },
        };
      }
      if (table === "meal_records") {
        return makeThenable({ data: [], error: null });
      }
      if (table === "ai_analysis") {
        return makeThenable({ data: [{ id: "v9" }], error: null });
      }
      throw new Error(`unexpected ${table}`);
    },
  };
  const service = createUserImageOpsService({ db, deleteFiles: async () => {} });
  await assert.rejects(
    () => service.delete({ kind: "asset", id: assetId }),
    (error) => error instanceof PublicUserImageError && error.code === "USER_IMAGE_PROTECTED",
  );
});
