import assert from "node:assert/strict";
import test from "node:test";
import { createDeepseekVisionService } from "./deepseek-vision-service.cjs";

test("DeepSeek vision uses the OpenAI-compatible endpoint and image content blocks", async () => {
  let request;
  const service = createDeepseekVisionService({
    apiKey: "test-key",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return new Response(JSON.stringify({ id: "resp-1", choices: [{ message: { content: JSON.stringify({ mealName: "午餐", mealType: "lunch", confidence: 0.9, portionConfidence: 0.9, needsEscalation: false, uncertaintyReasons: [], advice: "适量搭配", items: [{ name: "米饭", quantityG: 150, caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3 }] }) } }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  const result = await service({ imageUrl: "data:image/jpeg;base64,abc", budget: { stageTimeout: () => 5000 } });
  assert.equal(request.url, "https://api.deepseek.com/chat/completions");
  assert.equal(request.body.model, "deepseek-v4-flash-vision-exp");
  assert.equal(request.body.messages[0].content[0].type, "image_url");
  assert.equal(result.provider, "deepseek");
  assert.equal(result.items[0].name, "米饭");
});

test("DeepSeek vision returns successfully when the adapter records provider events", async () => {
  const events = [];
  const service = createDeepseekVisionService({
    apiKey: "deepseek-key",
    requestCompletion: async ({ onRequestEvent }) => {
      onRequestEvent({ providerHttpStatus: 200, providerRequestDurationMs: 12 });
      return {
        content: JSON.stringify({
          mealName: "沙拉",
          mealType: "lunch",
          confidence: 0.9,
          portionConfidence: 0.9,
          needsEscalation: false,
          items: [{ name: "生菜", quantityG: 100, caloriesPer100g: 20, proteinPer100g: 1, carbsPer100g: 3, fatPer100g: 0 }],
        }),
      };
    },
  });

  const result = await service({
    imageUrl: "https://example.com/meal.jpg",
    budget: { stageTimeout: () => 5000 },
    observe: (event) => events.push(event),
  });

  assert.equal(result.provider, "deepseek");
  assert.equal(events[0].providerHttpStatus, 200);
});
