import assert from "node:assert/strict";
import test from "node:test";

import { createVisionImageRetentionService } from "./vision-image-retention-service.cjs";

test("purge deletes orphan analyses and clears paths; protects meal-linked images", async () => {
  const deleted = [];
  const clearedAnalyses = [];
  const clearedFlags = [];
  const oldIso = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  const db = {
    from(table) {
      if (table === "meal_records") {
        return {
          select() {
            return {
              not() {
                return {
                  limit: async () => ({ data: [{ image_path: "cloud://keep-me" }], error: null }),
                };
              },
            };
          },
        };
      }
      if (table === "content_moderation_flags") {
        return {
          select() {
            return {
              eq() {
                return {
                  not() {
                    return {
                      order() {
                        return {
                          limit: async () => ({
                            data: [{
                              id: "flag-1",
                              image_path: "cloud://blocked-old",
                              status: "reviewed",
                              created_at: oldIso,
                              reviewed_at: oldIso,
                            }],
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload) {
            return {
              eq(idKey, id) {
                clearedFlags.push({ id, payload });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "ai_analysis") {
        return {
          select() {
            return {
              not() {
                return {
                  lt() {
                    return {
                      order() {
                        return {
                          limit: async () => ({
                            data: [
                              { id: "a1", image_path: "cloud://orphan", created_at: oldIso },
                              { id: "a2", image_path: "cloud://keep-me", created_at: oldIso },
                            ],
                            error: null,
                          }),
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          update(payload) {
            return {
              eq(idKey, id) {
                clearedAnalyses.push({ id, payload });
                return Promise.resolve({ error: null });
              },
            };
          },
        };
      }
      if (table === "uploaded_assets") {
        return {
          update() {
            return {
              in: async () => ({ error: null }),
            };
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };

  const service = createVisionImageRetentionService({
    db,
    deleteFiles: async ({ cloudPaths }) => {
      deleted.push(...cloudPaths);
    },
  });

  const result = await service.purgeExpiredVisionImages({ limit: 50 });
  assert.ok(deleted.includes("cloud://blocked-old"));
  assert.ok(deleted.includes("cloud://orphan"));
  assert.ok(!deleted.includes("cloud://keep-me"));
  assert.equal(result.skippedProtected >= 1, true);
  assert.equal(result.failed, 0);
});
