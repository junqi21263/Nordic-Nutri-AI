import assert from "node:assert/strict";
import test from "node:test";

import {
  createRecognitionFeedbackDataService,
  PublicRecognitionFeedbackError,
} from "./recognition-feedback-data-service.cjs";

const analysisId = "11111111-1111-4111-8111-111111111111";
const feedbackId = "22222222-2222-4222-8222-222222222222";
const mealId = "33333333-3333-4333-8333-333333333333";

function createDb(feedbackType = "wrong_food") {
  const writes = [];
  return {
    writes,
    from(table) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle: async () => {
          if (table === "ai_analysis") {
            return {
              data: {
                id: analysisId,
                user_id: "user-a",
                provider: "qwen",
                model: "qwen-vl",
                image_sha256: "a".repeat(64),
                normalized_items: [],
                meal_type: "lunch",
              },
              error: null,
            };
          }
          if (table === "recognition_feedback") {
            return { data: { id: feedbackId, user_id: "user-a", feedback_type: feedbackType }, error: null };
          }
          if (table === "meal_records") {
            return { data: { id: mealId, user_id: "user-a" }, error: null };
          }
          return { data: null, error: null };
        },
        insert(payload) {
          writes.push({ table, operation: "insert", payload });
          return query;
        },
        update(payload) {
          writes.push({ table, operation: "update", payload });
          return query;
        },
        then(resolve) {
          resolve({ data: null, error: null });
        },
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
    originalResult: {
      mealType: "lunch",
      items: [{ name: "鸡胸肉", quantityG: 100 }],
    },
  });

  assert.equal(result.feedbackId, feedbackId);
  const write = db.writes.find((item) => item.operation === "insert");
  assert.equal(write.table, "recognition_feedback");
  assert.equal(write.payload.user_id, "user-a");
  assert.equal(write.payload.meal_id, null);
  assert.equal(write.payload.corrected_result, null);
  assert.equal(write.payload.analysis_id, analysisId);
});

test("rejects unsupported reasons and oversized snapshots before persistence", async () => {
  const service = createRecognitionFeedbackDataService({
    db: { from: () => { throw new Error("must not write"); } },
  });

  await assert.rejects(
    () => service.createFeedback("user-a", { feedbackType: "unknown", originalResult: {} }),
    PublicRecognitionFeedbackError,
  );
  await assert.rejects(
    () => service.createFeedback("user-a", { feedbackType: "other", originalResult: { title: "x".repeat(10001) } }),
    PublicRecognitionFeedbackError,
  );
});

test("corrections update recognition history without creating a support ticket", async () => {
  const db = createDb();
  const service = createRecognitionFeedbackDataService({ db });
  const result = await service.updateFeedback("user-a", feedbackId, {
    mealId,
    correctedResult: { mealType: "lunch", items: [] },
  });

  assert.equal(result.feedbackId, feedbackId);
  const write = db.writes.find((item) => item.operation === "update");
  assert.equal(write.table, "recognition_feedback");
  assert.equal(write.payload.meal_id, mealId);
  assert.deepEqual(write.payload.corrected_result, { mealType: "lunch", title: null, items: [] });
  assert.equal(db.writes.some((item) => item.table === "user_feedback"), false);
});

test("only a written Other note creates a support ticket", async () => {
  const db = createDb("other");
  const service = createRecognitionFeedbackDataService({ db });
  await service.updateFeedback("user-a", feedbackId, { note: "寿司种类不对" });
  const mirrored = db.writes.find((item) => item.table === "user_feedback" && item.operation === "insert");
  assert.equal(mirrored.payload.client_request_id, feedbackId);
  assert.match(mirrored.payload.content, /寿司种类不对/);
});

test("Other requires written feedback before submission", async () => {
  const db = createDb("other");
  await assert.rejects(
    () => createRecognitionFeedbackDataService({ db }).updateFeedback("user-a", feedbackId, { note: "  " }),
    PublicRecognitionFeedbackError,
  );
  assert.equal(db.writes.length, 0);
});

test("correction notes stay out of support tickets", async () => {
  const db = createDb("wrong_food");
  await createRecognitionFeedbackDataService({ db }).updateFeedback("user-a", feedbackId, { note: "补充说明" });
  assert.equal(db.writes.some((item) => item.table === "user_feedback"), false);
});
