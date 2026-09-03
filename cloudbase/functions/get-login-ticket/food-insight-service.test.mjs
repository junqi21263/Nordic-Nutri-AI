import assert from "node:assert/strict";
import test from "node:test";

import { createFoodInsightService, createRoutedFoodInsightCompletion } from "./food-insight-service.cjs";

const food = {
  id: "11111111-2222-4333-8444-555555555555",
  nameZh: "鸡胸肉",
  nameEn: "Chicken breast",
  category: { nameZh: "肉禽" },
  foodForm: "熟制",
  nutritionPer100g: { calories: 132, protein: 19.3, carbs: 0, fat: 1, fiber: null, sugar: null, sodium: 58 },
};

test("uses the enabled CloudBase hy3 model with bounded food facts", async () => {
  let request;
  const service = createFoodInsightService({
    ai: {
      createModel(groupName) {
        assert.equal(groupName, "cloudbase");
        return {
          async generateText(input) {
            request = input;
            return {
              text: JSON.stringify({
                headline: "鸡胸肉的蛋白质优势",
                content: "鸡胸肉属于瘦肉类。每100g约含19.3g蛋白质、132kcal和1g脂肪，适合日常补充优质蛋白；搭配全谷物和蔬菜更均衡。",
              }),
              usage: { total_tokens: 120 },
            };
          },
        };
      },
    },
    model: "hy3",
  });

  const insight = await service.getInsight(food);

  assert.equal(insight.source, "cloudbase");
  assert.equal(insight.model, "hy3");
  assert.equal(insight.headline, "鸡胸肉的蛋白质优势");
  assert.match(insight.content, /19\.3g蛋白质/);
  assert.equal(request.model, "hy3");
  assert.match(request.messages[0].content, /不得诊断/);
  assert.match(request.messages[1].content, /鸡胸肉/);
  assert.match(request.messages[1].content, /19\.3/);
});

test("falls back to a fact-based food introduction when the model response is invalid", async () => {
  const service = createFoodInsightService({
    requestCompletion: async () => "not-json",
    model: "hy3",
  });

  const insight = await service.getInsight(food);

  assert.equal(insight.source, "rule_v1");
  assert.equal(insight.model, null);
  assert.match(insight.content, /鸡胸肉/);
  assert.match(insight.content, /19\.3g/);
});

test("uses the configured provider and model for food insight completion", async () => {
  let request;
  const completion = createRoutedFoodInsightCompletion({
    apiKey: "provider-key",
    model: "configured-food-insight-model",
    route: {
      providerKey: "sensenova",
      modelKey: "configured-food-insight-model",
      endpoint: "https://provider.example/v1/chat/completions",
    },
    fetchImpl: async (_url, init) => {
      request = JSON.parse(init.body);
      return {
        ok: true,
        async json() {
          return {
            choices: [{ message: { content: JSON.stringify({
              headline: "鸡胸肉的蛋白质优势",
              content: "每100g约含19.3g蛋白质，适合搭配蔬菜和主食。",
            }) } }],
            usage: { total_tokens: 42 },
          };
        },
      };
    },
  });
  const service = createFoodInsightService({
    requestCompletion: completion,
    source: "sensenova",
    model: "configured-food-insight-model",
  });

  const insight = await service.getInsight(food);

  assert.equal(insight.source, "sensenova");
  assert.equal(insight.model, "configured-food-insight-model");
  assert.equal(request.model, "configured-food-insight-model");
  assert.equal(request.messages[0].role, "system");
  assert.match(request.messages[1].content, /鸡胸肉/);
});

test("preserves the dev worker model metadata for a valid delegated completion", async () => {
  const service = createFoodInsightService({
    requestCompletion: async () => JSON.stringify({
      headline: "鸡胸肉的营养参考",
      content: "每100g约含19.3g蛋白质，适合搭配蔬菜和主食。",
    }),
    source: "hunyuan-exp",
    model: "hunyuan-2.0-instruct-20251111",
  });

  const insight = await service.getInsight(food);

  assert.equal(insight.source, "hunyuan-exp");
  assert.equal(insight.model, "hunyuan-2.0-instruct-20251111");
});

test("reuses a cached food insight for the same nutrition context", async () => {
  const rows = { food_nutrition_insights: [] };
  const db = {
    from(table) {
      assert.equal(table, "food_nutrition_insights");
      let selected = rows[table];
      const chain = {
        eq(column, value) {
          selected = selected.filter((row) => row[column] === value);
          return chain;
        },
        select() { return chain; },
        maybeSingle: async () => ({ data: selected[0] ?? null, error: null }),
      };
      return {
        select() { return chain; },
        async upsert(payload) {
          const existing = rows[table].find((row) => row.food_id === payload.food_id);
          if (existing) Object.assign(existing, payload);
          else rows[table].push({ id: "insight-1", ...payload });
          return { data: payload, error: null };
        },
      };
    },
  };
  let calls = 0;
  const service = createFoodInsightService({
    db,
    requestCompletion: async () => {
      calls += 1;
      return JSON.stringify({
        headline: "鸡胸肉的蛋白质优势",
        content: "每100g约含19.3g蛋白质，适合搭配蔬菜和主食。",
      });
    },
    source: "hunyuan-exp",
    model: "hunyuan-2.0-instruct-20251111",
  });

  const first = await service.getInsight(food);
  const second = await service.getInsight(food);

  assert.equal(calls, 1);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.headline, "鸡胸肉的蛋白质优势");
});
