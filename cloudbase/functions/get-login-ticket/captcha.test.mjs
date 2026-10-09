import assert from "node:assert/strict";
import test from "node:test";

import { createCaptchaService } from "./services/captcha.cjs";

function createStore() {
  const rows = new Map();
  return {
    rows,
    async insert(row) {
      rows.set(row.target, { ...row });
    },
    async find(target) {
      return rows.get(target) ?? null;
    },
    async update(target, patch) {
      const row = rows.get(target);
      if (row) rows.set(target, { ...row, ...patch });
    },
  };
}

function createRepositoryStyleStore() {
  const rows = new Map();
  return {
    rows,
    async insertVerification(row) {
      rows.set(row.target, { ...row });
    },
    async find(target) {
      return rows.get(target) ?? null;
    },
    async update(target, patch) {
      const row = rows.get(target);
      if (row) rows.set(target, { ...row, ...patch });
    },
  };
}

test("generates SVG CAPTCHA without returning or logging the answer", async () => {
  const store = createStore();
  const service = createCaptchaService({
    secret: "captcha-secret",
    store,
    create: () => ({ data: "<svg>captcha</svg>", text: "AbCd" }),
    id: () => "captcha-1",
    now: () => 1_700_000_000_000,
  });

  const result = await service.getCaptcha();
  const saved = store.rows.get("captcha-1");

  assert.deepEqual(result, { captchaId: "captcha-1", image: "<svg>captcha</svg>", expiresIn: 300 });
  assert.equal(saved.target_type, "captcha");
  assert.equal(saved.purpose, "captcha");
  assert.equal(saved.code_hash.length, 64);
  assert.notEqual(saved.code_hash, "AbCd");
  assert.equal("text" in result, false);
});

test("consumes a valid CAPTCHA once and rejects replay", async () => {
  const store = createStore();
  const service = createCaptchaService({
    secret: "captcha-secret",
    store,
    create: () => ({ data: "<svg />", text: "AbCd" }),
    id: () => "captcha-2",
    now: () => 1_700_000_000_000,
  });

  await service.getCaptcha();
  assert.equal(await service.verifyCaptcha("captcha-2", "abcd"), true);
  await assert.rejects(() => service.verifyCaptcha("captcha-2", "abcd"), (error) => error.code === "AUTH_CAPTCHA_INVALID");
});

test("rejects expired CAPTCHA challenges", async () => {
  const store = createStore();
  let now = 1_700_000_000_000;
  const service = createCaptchaService({
    secret: "captcha-secret",
    store,
    create: () => ({ data: "<svg />", text: "AbCd" }),
    id: () => "captcha-3",
    now: () => now,
  });

  await service.getCaptcha();
  now += 301_000;
  await assert.rejects(() => service.verifyCaptcha("captcha-3", "abcd"), (error) => error.code === "AUTH_CAPTCHA_EXPIRED");
});

test("stores CAPTCHA challenges through the auth repository contract", async () => {
  const store = createRepositoryStyleStore();
  const service = createCaptchaService({
    secret: "captcha-secret",
    store,
    create: () => ({ data: "<svg />", text: "AbCd" }),
    id: () => "captcha-repository-contract",
    now: () => 1_700_000_000_000,
  });

  await service.getCaptcha();
  assert.equal(store.rows.has("captcha-repository-contract"), true);
});
