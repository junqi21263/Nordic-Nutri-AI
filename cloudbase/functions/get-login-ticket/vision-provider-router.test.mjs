import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredVisionAnalyzer, hasVisionBinding } from "./vision-provider-router.cjs";

test("vision router selects the configured provider binding", async () => {
  const calls = [];
  const analyze = createConfiguredVisionAnalyzer({
    db: { from: () => ({ select: async () => ({ data: [{ provider_key: "deepseek", feature_keys: ["vision"], enabled: true }] }) }) },
    adapters: { qwen: async () => calls.push("qwen"), deepseek: async () => { calls.push("deepseek"); return { provider: "deepseek" }; } },
  });
  const result = await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(calls, ["deepseek"]);
  assert.equal(result.provider, "deepseek");
});

test("vision router supports PostgreSQL array text and route role bindings", () => {
  assert.equal(hasVisionBinding({ feature_keys: "{vision,coach}" }), true);
  assert.equal(hasVisionBinding({ feature_keys: [], metadata: { routeRoles: { vision: "primary" } } }), true);
  assert.equal(hasVisionBinding({ feature_keys: ["coach"] }), false);
});
