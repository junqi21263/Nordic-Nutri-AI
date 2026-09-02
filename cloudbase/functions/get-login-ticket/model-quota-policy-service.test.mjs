import assert from "node:assert/strict";
import test from "node:test";
import quotaModule from "./model-quota-policy-service.cjs";

const { createModelQuotaPolicyService, ModelQuotaPolicyError } = quotaModule;

function createDb({ policy = null, consume = { allowed: true, used_count: 1, remaining: 9 }, usage = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      assert.equal(table, "ai_model_quota_policies");
      return {
        select() {
          return {
            eq() { return this; },
            maybeSingle: async () => ({ data: policy, error: null }),
            order: async () => ({ data: policy ? [policy] : [], error: null }),
          };
        },
      };
    },
    async rpc(name, input) {
      calls.push({ name, input });
      return { data: name === "get_ai_model_quota_usage" ? usage : [consume], error: null };
    },
  };
}

test("an unconfigured model policy does not impose a hidden limit", async () => {
  const service = createModelQuotaPolicyService({ db: createDb() });
  const result = await service.assertAllowed({ providerKey: "deepseek", modelKey: "deepseek-v4-flash", featureKey: "vision" });
  assert.equal(result.limited, false);
  assert.equal(result.policy.dailyRequestLimit, null);
});

test("quota snapshot joins exact global counters to their policy", async () => {
  const policy = { provider_key: "deepseek", model_key: "deepseek-v4-flash", feature_key: "coach", enabled: true, daily_request_limit: 10 };
  const service = createModelQuotaPolicyService({ db: createDb({ policy, usage: [{ provider_key: "deepseek", model_key: "deepseek-v4-flash", feature_key: "coach", used_count: 3 }] }) });
  const [snapshot] = await service.listPolicyUsage();
  assert.equal(snapshot.usage.usedCount, 3);
  assert.equal(snapshot.usage.remaining, 7);
});

test("a disabled policy rejects before provider invocation", async () => {
  const service = createModelQuotaPolicyService({
    db: createDb({ policy: { provider_key: "deepseek", model_key: "deepseek-v4-flash", feature_key: "vision", enabled: false, daily_request_limit: 20 } }),
  });
  await assert.rejects(
    () => service.assertAllowed({ providerKey: "deepseek", modelKey: "deepseek-v4-flash", featureKey: "vision" }),
    (error) => error instanceof ModelQuotaPolicyError && error.code === "MODEL_QUOTA_DISABLED",
  );
});

test("saving a policy rejects unavailable provider balance modes", async () => {
  const service = createModelQuotaPolicyService({ db: createDb() });
  for (const providerBalanceMode of ["guess", "automatic"]) {
    await assert.rejects(
      () => service.savePolicy("admin", {
        providerKey: "deepseek",
        modelKey: "deepseek-v4-flash",
        featureKey: "vision",
        providerBalanceMode,
      }),
      (error) => error instanceof ModelQuotaPolicyError && error.code === "MODEL_QUOTA_POLICY_INVALID",
    );
  }
});

test("a limited policy atomically consumes the provider-model-feature quota", async () => {
  const db = createDb({
    policy: { provider_key: "deepseek", model_key: "deepseek-v4-flash", feature_key: "vision", enabled: true, daily_request_limit: 10, alert_threshold_percent: 80 },
    consume: { allowed: true, used_count: 8, remaining: 2 },
  });
  const service = createModelQuotaPolicyService({ db });
  const result = await service.assertAllowed({ providerKey: "deepseek", modelKey: "deepseek-v4-flash", featureKey: "vision" });
  assert.equal(result.limited, true);
  assert.equal(result.usage.usedCount, 8);
  assert.deepEqual(db.calls, [{
    name: "consume_ai_model_quota",
    input: {
      p_provider_key: "deepseek",
      p_model_key: "deepseek-v4-flash",
      p_feature_key: "vision",
      p_daily_limit: 10,
    },
  }]);
});
