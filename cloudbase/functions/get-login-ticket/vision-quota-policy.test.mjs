import assert from "node:assert/strict";
import test from "node:test";
import { getVisionQuotaPolicy } from "./vision-quota-policy.cjs";

test("DEV uses a high bounded vision quota", () => {
  assert.deepEqual(getVisionQuotaPolicy({ TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a" }), {
    dailyLimit: 500,
    burstLimit: 50,
    enforce: false,
    isDev: true,
  });
});

test("production keeps the original vision quota", () => {
  assert.deepEqual(getVisionQuotaPolicy({ TCB_ENV: "lewis-healthy-d4glgqqzv73a5bc10" }), {
    dailyLimit: 10,
    burstLimit: 3,
    enforce: true,
    isDev: false,
  });
});
