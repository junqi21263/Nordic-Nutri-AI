import test from "node:test";
import assert from "node:assert/strict";
import { createFeatureUserQuotaPolicyService } from "./feature-user-quota-policy-service.cjs";

function dbWith({ policy = null, rpcRow = null } = {}) {
  return {
    from() {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        order() { return Promise.resolve({ data: policy ? [policy] : [], error: null }); },
        maybeSingle() { return Promise.resolve({ data: policy, error: null }); },
        upsert() { return chain; },
      };
      return chain;
    },
    async rpc() { return { data: [rpcRow], error: null }; },
  };
}

test("unconfigured feature quota is unlimited", async () => {
  const result = await createFeatureUserQuotaPolicyService({ db: dbWith() }).assertAllowed({ userId: "user-1", featureKey: "coach" });
  assert.equal(result.limited, false);
});

test("configured feature quota consumes an atomic user-day counter", async () => {
  let input;
  const db = dbWith({ policy: { feature_key: "coach", daily_request_limit: 3 }, rpcRow: { allowed: true, used_count: 1, remaining: 2 } });
  const originalRpc = db.rpc;
  db.rpc = async (name, params) => { input = { name, params }; return originalRpc(); };
  const result = await createFeatureUserQuotaPolicyService({ db }).assertAllowed({ userId: "user-1", featureKey: "coach" });
  assert.equal(result.limited, true);
  assert.deepEqual(input, { name: "consume_ai_feature_user_quota", params: { p_user_id: "user-1", p_feature_key: "coach", p_daily_limit: 3 } });
});

test("exceeded feature quota returns a stable public code", async () => {
  const service = createFeatureUserQuotaPolicyService({ db: dbWith({ policy: { feature_key: "food_recognition", daily_request_limit: 1 }, rpcRow: { allowed: false, used_count: 1, remaining: 0 } }) });
  await assert.rejects(() => service.assertAllowed({ userId: "user-1", featureKey: "food_recognition" }), (error) => error.code === "FEATURE_USER_QUOTA_EXCEEDED");
});
