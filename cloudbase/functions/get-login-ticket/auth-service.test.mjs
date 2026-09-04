import assert from "node:assert/strict";
import test from "node:test";

import { createAuthService, hashAuthValue } from "./services/auth.cjs";

function createRepo(clock = () => 1_700_000_000_000) {
  const repo = {
    users: [],
    verification: [],
    async insertVerification(row) { this.verification.push({ ...row }); },
    async invalidateVerification({ target, targetType, purpose }) {
      this.verification = this.verification.filter((row) => !(row.target === target && row.target_type === targetType && row.purpose === purpose));
    },
    async consumeVerification({ target, targetType, purpose, codeHash }) {
      const row = this.verification.find((item) => item.target === target && item.target_type === targetType && item.purpose === purpose && item.code_hash === codeHash && !item.used_at);
      if (!row || new Date(row.expires_at).getTime() <= clock() || row.attempt_count >= 5) return null;
      row.used_at = new Date(clock()).toISOString();
      return row;
    },
    async findUserByEmail(email) { return this.users.find((user) => user.email_normalized === email) ?? null; },
    async findUserByPhone(phone) { return this.users.find((user) => user.phone_e164 === phone) ?? null; },
    async findUserByGoogleSub(sub) { return this.users.find((user) => user.google_sub === sub) ?? null; },
    async findUserByEmailForGoogle(email) { return this.users.find((user) => user.email_normalized === email) ?? null; },
    async insertUser(user) { const created = { id: `user-${this.users.length + 1}`, token_version: 1, ...user }; this.users.push(created); return created; },
    async updatePassword(userId, passwordHash) { const user = this.users.find((item) => item.id === userId); user.password_hash = passwordHash; user.token_version += 1; return user; },
  };
  return repo;
}

function createService(repo, overrides = {}) {
  return createAuthService({
    repo,
    authHmacSecret: "auth-secret",
    sessionSecret: "session-secret",
    verifyCaptcha: async () => true,
    sendEmail: async () => {},
    sendSms: async () => {},
    hashPassword: async (password) => `argon2id:${password}`,
    verifyPassword: async (password, hash) => hash === `argon2id:${password}`,
    now: () => 1_700_000_000_000,
    ...overrides,
  });
}

test("does not send a verification code when CAPTCHA fails", async () => {
  const repo = createRepo();
  let sends = 0;
  const service = createService(repo, {
    verifyCaptcha: async () => { throw Object.assign(new Error("bad captcha"), { code: "AUTH_CAPTCHA_INVALID" }); },
    sendEmail: async () => { sends += 1; },
  });

  await assert.rejects(
    () => service.sendVerificationCode({ targetType: "email", target: "User@Example.com", purpose: "register", captchaId: "c1", captchaAnswer: "bad" }),
    (error) => error.code === "AUTH_CAPTCHA_INVALID",
  );
  assert.equal(sends, 0);
  assert.equal(repo.verification.length, 0);
});

test("registers an email account only after atomically consuming its OTP", async () => {
  const repo = createRepo();
  const service = createService(repo, { random: () => 0.123456 });
  await service.sendVerificationCode({ targetType: "email", target: "User@Example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });

  const result = await service.registerEmail({ email: "User@Example.com", code: "123456", password: "password" });
  assert.equal(result.user.id, "user-1");
  assert.equal(repo.users[0].email_verified_at, new Date(1_700_000_000_000).toISOString());
  assert.equal(repo.verification[0].used_at, new Date(1_700_000_000_000).toISOString());
  assert.equal(result.session.accessToken.split(".").length, 2);
});

test("maps missing and wrong-password email login to the same public error", async () => {
  const repo = createRepo();
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:correct", status: "active", token_version: 1 });
  const service = createService(repo);

  await assert.rejects(() => service.loginEmail({ email: "missing@example.com", password: "wrong" }), (error) => error.code === "AUTH_INVALID_CREDENTIALS");
  await assert.rejects(() => service.loginEmail({ email: "user@example.com", password: "wrong" }), (error) => error.code === "AUTH_INVALID_CREDENTIALS");
});

test("does not auto-merge a Google identity with an email account", async () => {
  const repo = createRepo();
  repo.users.push({ id: "email-user", email_normalized: "user@example.com", password_hash: "argon2id:correct", status: "active", token_version: 1 });
  const service = createService(repo, {
    verifyGoogleToken: async () => ({ sub: "google-1", email: "user@example.com", email_verified: true }),
  });

  await assert.rejects(() => service.loginGoogle("id-token"), (error) => error.code === "AUTH_EMAIL_ALREADY_REGISTERED");
  assert.equal(repo.users.length, 1);
});

test("password reset changes the password and increments token_version", async () => {
  const repo = createRepo();
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:old", status: "active", token_version: 4 });
  repo.verification.push({
    target: hashAuthValue("user@example.com", "auth-secret", "email"),
    target_type: "email",
    purpose: "forgot_password",
    code_hash: hashAuthValue("123456", "auth-secret", "otp"),
    expires_at: new Date(1_700_000_600_000).toISOString(),
    attempt_count: 0,
    used_at: null,
  });
  const service = createService(repo);

  await service.resetPassword({ targetType: "email", target: "user@example.com", code: "123456", password: "newpass8" });
  assert.equal(repo.users[0].password_hash, "argon2id:newpass8");
  assert.equal(repo.users[0].token_version, 5);
});

test("forgot-password for an unknown destination returns generic success without sending", async () => {
  const repo = createRepo();
  let sends = 0;
  const service = createService(repo, { sendEmail: async () => { sends += 1; } });

  const result = await service.sendVerificationCode({ targetType: "email", target: "missing@example.com", purpose: "forgot_password", captchaId: "c1", captchaAnswer: "ok" });
  assert.deepEqual(result, { sent: true, expiresIn: 600, resendAfter: 60 });
  assert.equal(sends, 0);
  assert.equal(repo.verification.length, 0);
});

test("reports an expired OTP separately from an invalid OTP", async () => {
  const repo = createRepo();
  repo.findLatestVerification = async () => ({ expires_at: new Date(1_699_999_999_000).toISOString() });
  const service = createService(repo);

  await assert.rejects(
    () => service.resetPassword({ targetType: "email", target: "user@example.com", code: "123456", password: "newpass8" }),
    (error) => error.code === "AUTH_OTP_EXPIRED",
  );
});
