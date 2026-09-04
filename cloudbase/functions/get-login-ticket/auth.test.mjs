import assert from "node:assert/strict";
import test from "node:test";

import {
  createAccessToken,
  generateOtp,
  hashAuthValue,
  normalizeEmail,
  normalizePhone,
  validatePassword,
  verifyAccessToken,
} from "./services/auth.cjs";

test("normalizes email to a stable lookup value", () => {
  assert.equal(normalizeEmail("  User@Example.COM "), "user@example.com");
});

test("accepts only canonical E.164 phone values", () => {
  assert.equal(normalizePhone("+8613800138000"), "+8613800138000");
  assert.throws(() => normalizePhone("13800138000"), (error) => error.code === "AUTH_INVALID_REQUEST");
});

test("enforces the V1 password length boundaries", () => {
  assert.equal(validatePassword("12345678"), "12345678");
  assert.equal(validatePassword("a".repeat(128)), "a".repeat(128));
  assert.throws(() => validatePassword("1234567"), (error) => error.code === "AUTH_INVALID_REQUEST");
  assert.throws(() => validatePassword("a".repeat(129)), (error) => error.code === "AUTH_INVALID_REQUEST");
});

test("generates six digit OTPs and stores only an HMAC digest", () => {
  const code = generateOtp(() => 0.123456);
  assert.match(code, /^\d{6}$/);
  assert.notEqual(hashAuthValue(code, "test-secret", "otp"), code);
  assert.equal(hashAuthValue(code, "test-secret", "otp").length, 64);
});

test("issues and verifies a seven-day token containing the user version", () => {
  const now = () => 1_700_000_000_000;
  const token = createAccessToken({
    userId: "00000000-0000-4000-8000-000000000001",
    tokenVersion: 3,
    secret: "session-secret",
    now,
  });

  assert.deepEqual(verifyAccessToken(token, "session-secret", { now }), {
    sub: "00000000-0000-4000-8000-000000000001",
    ver: 3,
    iat: 1_700_000_000,
    exp: 1_700_604_800,
  });
  assert.equal(verifyAccessToken(token, "wrong-secret", { now }), null);
  assert.equal(verifyAccessToken(token, "session-secret", { now: () => 1_700_604_801_000 }), null);
});
