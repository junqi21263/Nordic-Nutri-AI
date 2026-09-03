import assert from "node:assert/strict";
import test from "node:test";

import {
  createFoodImageAuditVision,
  FoodImageAuditVisionError,
} from "./food-image-audit-vision.cjs";

const auditInput = {
  imageUrl: "https://cdn.example.com/food/powder.jpg",
  foodNameZh: "低热量水果味饮料粉",
  foodNameEn: "Low-calorie fruit-flavored drink powder",
  expectedVisualType: "drink_powder",
  matchedKeywords: ["饮料粉"],
};

test("audit vision returns a valid fail result for fruit shown instead of drink powder", async () => {
  const audit = createFoodImageAuditVision({
    requestCompletion: async () => JSON.stringify({
      verdict: "fail",
      detectedSubject: "完整水果",
      confidence: 0.96,
      reasons: ["主体与饮料粉不符", "图片展示了完整水果"],
    }),
  });

  const result = await audit(auditInput);

  assert.deepEqual(result, {
    verdict: "fail",
    detectedSubject: "完整水果",
    confidence: 0.96,
    reasons: ["主体与饮料粉不符", "图片展示了完整水果"],
  });
});

test("audit vision rejects malformed JSON results", async () => {
  const audit = createFoodImageAuditVision({ requestCompletion: async () => "not-json" });

  await assert.rejects(
    () => audit(auditInput),
    (error) => error instanceof FoodImageAuditVisionError && error.code === "FOOD_IMAGE_AUDIT_RESULT_INVALID",
  );
});

test("audit vision rejects confidence outside the inclusive zero-to-one range", async () => {
  const audit = createFoodImageAuditVision({
    requestCompletion: async () => JSON.stringify({
      verdict: "pass",
      detectedSubject: "浅色碗装粉末",
      confidence: 1.01,
      reasons: ["主体符合预期"],
    }),
  });

  await assert.rejects(
    () => audit(auditInput),
    (error) => error instanceof FoodImageAuditVisionError && error.code === "FOOD_IMAGE_AUDIT_RESULT_INVALID",
  );
});

test("audit vision uses the configured route endpoint and model", async () => {
  let request;
  const audit = createFoodImageAuditVision({
    apiKey: "provider-key",
    model: "configured-audit-model",
    endpoint: "https://provider.example/v1/chat/completions",
    maxTokens: 300,
    temperature: 0.1,
    fetchImpl: async (url, init) => {
      request = { url, body: JSON.parse(init.body) };
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({
              verdict: "pass",
              detectedSubject: "碗装饮料粉",
              confidence: 0.9,
              reasons: ["主体符合预期形态"],
            }) } }],
          };
        },
      };
    },
  });

  await audit(auditInput);

  assert.equal(request.url, "https://provider.example/v1/chat/completions");
  assert.equal(request.body.model, "configured-audit-model");
  assert.equal(request.body.max_tokens, 300);
  assert.equal(request.body.temperature, 0.1);
});
