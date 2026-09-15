import assert from "node:assert/strict";
import test from "node:test";

import { createAuthRepository, createAuthService, hashAuthValue, hashVerificationCode } from "./services/auth.cjs";

function createRepo(clock = () => 1_700_000_000_000) {
  const repo = {
    users: [],
    verification: [],
    async insertVerification(row) { const created = { id: `verification-${this.verification.length + 1}`, ...row }; this.verification.push(created); return created; },
    async updateVerification(id, patch) { const row = this.verification.find((item) => item.id === id); if (row) Object.assign(row, patch); },
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
    async findUserById(id) { return this.users.find((user) => user.id === id) ?? null; },
    async insertUser(user) { const created = { id: `user-${this.users.length + 1}`, status: "active", token_version: 1, ...user }; this.users.push(created); return created; },
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
    hashPassword: async (password) => `argon2id:${password}`,
    verifyPassword: async (password, hash) => hash === `argon2id:${password}`,
    now: () => 1_700_000_000_000,
    ...overrides,
  });
}

function createRateLimitRepo(clock) {
  const verification = [];
  const purposesFor = ({ purpose, purposes }) => new Set(Array.isArray(purposes) ? purposes : [purpose]);
  return {
    users: [],
    verification,
    async insertVerification(row) {
      const created = { id: `verification-${verification.length + 1}`, ...row };
      verification.push(created);
      return created;
    },
    async updateVerification(id, patch) {
      const row = verification.find((item) => item.id === id);
      if (row) Object.assign(row, patch);
    },
    async invalidateVerification({ target, targetType, purpose, purposes }) {
      const acceptedPurposes = purposesFor({ purpose, purposes });
      for (const row of verification) {
        if (row.target === target && row.target_type === targetType && acceptedPurposes.has(row.purpose) && !row.used_at) {
          row.status = "invalidated";
        }
      }
    },
    async findLatestVerification({ target, targetType, purpose, purposes }) {
      const acceptedPurposes = purposesFor({ purpose, purposes });
      return verification
        .filter((row) => row.target === target && row.target_type === targetType && acceptedPurposes.has(row.purpose) && !row.used_at && ["created", "sent"].includes(row.status))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] || null;
    },
    async countRecentVerification({ target, targetType, purpose, purposes, since }) {
      const acceptedPurposes = purposesFor({ purpose, purposes });
      return verification.filter((row) => row.target === target && row.target_type === targetType && acceptedPurposes.has(row.purpose) && new Date(row.created_at).getTime() >= since).length;
    },
    async findUserByEmail(email) { return this.users.find((user) => user.email_normalized === email) ?? null; },
    async findUserByPhone(phone) { return this.users.find((user) => user.phone_e164 === phone) ?? null; },
  };
}

test("passes the verification timestamp to the atomic OTP RPC", async () => {
  const calls = [];
  const repo = createAuthRepository({
    from() {},
    async rpc(name, params) {
      calls.push({ name, params });
      return { data: true, error: null };
    },
  });

  const now = 1_700_000_000_000;
  const result = await repo.consumeVerification({
    target: "target-hash",
    targetType: "email",
    purpose: "register",
    codeHash: "code-hash",
    now,
  });

  assert.deepEqual(result, { consumed: true });
  assert.deepEqual(calls, [{
    name: "consume_auth_verification_code",
    params: {
      p_target: "target-hash",
      p_target_type: "email",
      p_purpose: "register",
      p_code_hash: "code-hash",
      p_now: new Date(now).toISOString(),
    },
  }]);
});

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

test("opens email verification sending again after the rolling ten-minute window", async () => {
  let nowMs = 1_700_000_000_000;
  const repo = createRateLimitRepo(() => nowMs);
  const service = createService(repo, { now: () => nowMs });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await service.sendVerificationCode({ targetType: "email", target: "user@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });
    nowMs += 61_000;
  }

  nowMs = 1_700_000_000_000 + 11 * 60 * 1000;
  await assert.doesNotReject(
    () => service.sendVerificationCode({ targetType: "email", target: "user@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" }),
  );
});

test("limits phone verification sends to three in a rolling ten-minute window", async () => {
  let nowMs = 1_700_000_000_000;
  const repo = createRateLimitRepo(() => nowMs);
  const service = createService(repo, { now: () => nowMs, sendSms: async () => {} });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await service.sendVerificationCode({ targetType: "phone", target: "+8613800138000", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });
    nowMs += 61_000;
  }

  await assert.rejects(
    () => service.sendVerificationCode({ targetType: "phone", target: "+8613800138000", purpose: "register", captchaId: "c1", captchaAnswer: "ok" }),
    (error) => error.code === "AUTH_RATE_LIMITED",
  );
});

test("limits email verification sends to twenty in a rolling day", async () => {
  let nowMs = 1_700_000_000_000;
  const repo = createRateLimitRepo(() => nowMs);
  const service = createService(repo, { now: () => nowMs });

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await service.sendVerificationCode({ targetType: "email", target: "user@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });
    nowMs += 70 * 60 * 1000;
  }

  await assert.rejects(
    () => service.sendVerificationCode({ targetType: "email", target: "user@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" }),
    (error) => error.code === "AUTH_RATE_LIMITED",
  );
});

test("combines register and reset-password sends in the same rolling limits", async () => {
  let nowMs = 1_700_000_000_000;
  const repo = createRateLimitRepo(() => nowMs);
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", status: "active" });
  const service = createService(repo, { now: () => nowMs });

  for (let attempt = 0; attempt < 5; attempt += 1) {
    await service.sendVerificationCode({
      targetType: "email",
      target: "user@example.com",
      purpose: attempt % 2 === 0 ? "register" : "reset_password",
      captchaId: "c1",
      captchaAnswer: "ok",
    });
    nowMs += 61_000;
  }

  await assert.rejects(
    () => service.sendVerificationCode({ targetType: "email", target: "user@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" }),
    (error) => error.code === "AUTH_RATE_LIMITED",
  );
});

test("binds the OTP HMAC to the normalized target and purpose", () => {
  const digest = hashVerificationCode("user@example.com", "register", "123456", "test-secret");
  assert.equal(digest.length, 64);
  assert.notEqual(digest, hashVerificationCode("other@example.com", "register", "123456", "test-secret"));
  assert.notEqual(digest, hashVerificationCode("user@example.com", "reset_password", "123456", "test-secret"));
});

test("registers an email account only after atomically consuming its OTP", async () => {
  const repo = createRepo();
  const service = createService(repo, { random: () => 0.123456 });
  await service.sendVerificationCode({ targetType: "email", target: "User@Example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });

  const result = await service.registerEmail({ email: "User@Example.com", code: "123456", password: "password" });
  assert.equal(result.user.id, "user-1");
  assert.equal(repo.users[0].email_verified_at, new Date(1_700_000_000_000).toISOString());
  assert.equal(repo.users[0].registration_channel, "email");
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

test("password login skips CAPTCHA for email and phone", async () => {
  const repo = createRepo();
  repo.users.push(
    { id: "user-email", email_normalized: "user@example.com", password_hash: "argon2id:correct", status: "active", token_version: 1 },
    { id: "user-phone", phone_e164: "+8613800138000", password_hash: "argon2id:correct", status: "active", token_version: 1 },
  );
  let captchaChecks = 0;
  const service = createService(repo, {
    verifyCaptcha: async () => {
      captchaChecks += 1;
      throw Object.assign(new Error("captcha must not run for password login"), { code: "AUTH_CAPTCHA_INVALID" });
    },
  });

  await assert.doesNotReject(() => service.loginEmail({ email: "user@example.com", password: "correct" }));
  await assert.doesNotReject(() => service.loginPhone({ phone: "+8613800138000", password: "correct" }));
  assert.equal(captchaChecks, 0);
});

test("rate-limits repeated Email login failures by email and IP", async () => {
  const repo = createRepo();
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:correct", status: "active", token_version: 1 });
  const service = createService(repo);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await assert.rejects(
      () => service.loginEmail({ email: "user@example.com", password: "wrong", ip: "127.0.0.1" }),
      (error) => error.code === "AUTH_INVALID_CREDENTIALS",
    );
  }
  await assert.rejects(
    () => service.loginEmail({ email: "user@example.com", password: "wrong", ip: "127.0.0.1" }),
    (error) => error.code === "AUTH_RATE_LIMITED",
  );
});

test("password reset changes the password and increments token_version", async () => {
  const repo = createRepo();
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:old", status: "active", token_version: 4 });
  repo.verification.push({
    target: hashAuthValue("user@example.com", "auth-secret", "email-target"),
    target_type: "email",
    purpose: "reset_password",
    code_hash: hashVerificationCode("user@example.com", "reset_password", "123456", "auth-secret"),
    expires_at: new Date(1_700_000_600_000).toISOString(),
    attempt_count: 0,
    used_at: null,
  });
  const service = createService(repo);

  await service.resetPassword({ email: "user@example.com", code: "123456", password: "newpass8" });
  assert.equal(repo.users[0].password_hash, "argon2id:newpass8");
  assert.equal(repo.users[0].token_version, 5);
});

test("forgot-password for an unknown destination returns generic success without sending", async () => {
  const repo = createRepo();
  let sends = 0;
  const service = createService(repo, { sendEmail: async () => { sends += 1; } });

  const result = await service.sendVerificationCode({ targetType: "email", target: "missing@example.com", purpose: "reset_password", captchaId: "c1", captchaAnswer: "ok" });
  assert.deepEqual(result, { sent: true, expiresIn: 600, resendAfter: 60 });
  assert.equal(sends, 0);
  assert.equal(repo.verification.length, 0);
});

test("/auth/me returns only the minimal email account identity", async () => {
  const repo = createRepo();
  repo.users.push({
    id: "user-1",
    email: "User@Example.com",
    email_normalized: "user@example.com",
    email_verified_at: "2026-09-04T00:00:00.000Z",
    created_platform: "android_app",
    password_hash: "argon2id:password",
    status: "active",
    token_version: 1,
  });
  const service = createService(repo);
  const session = await service.loginEmail({ email: "user@example.com", password: "password", captchaId: "c1", captchaAnswer: "abcd" });
  assert.deepEqual(await service.getMe(session.session.accessToken), {
    user: {
      id: "user-1",
      email: "user@example.com",
      emailVerified: true,
      createdPlatform: "android_app",
    },
  });
});

test("reports an expired OTP separately from an invalid OTP", async () => {
  const repo = createRepo();
  repo.findLatestVerification = async () => ({ expires_at: new Date(1_699_999_999_000).toISOString() });
  const service = createService(repo);

  await assert.rejects(
    () => service.resetPassword({ email: "user@example.com", code: "123456", password: "newpass8" }),
    (error) => error.code === "AUTH_OTP_EXPIRED",
  );
});

test("registers and logs in a phone account with SMS OTP and password", async () => {
  const repo = createRepo();
  const sent = [];
  const service = createService(repo, {
    random: () => 0.123456,
    sendSms: async (phone, code) => sent.push({ phone, code }),
  });

  await service.sendVerificationCode({ targetType: "phone", target: "+8613800138000", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });
  assert.deepEqual(sent, [{ phone: "+8613800138000", code: "123456" }]);
  const created = await service.registerPhone({ phone: "+86 13800138000", code: "123456", password: "password" });
  assert.equal(created.user.id, "user-1");
  assert.equal(repo.users[0].phone_e164, "+8613800138000");
  assert.equal(repo.users[0].registration_channel, "phone");

  const login = await service.loginPhone({ phone: "+8613800138000", password: "password", captchaId: "c1", captchaAnswer: "ok" });
  assert.equal(login.user.id, "user-1");
});

test("maps CloudBase DATABASE_23505 phone registration conflicts to an existing account error", async () => {
  const repo = createRepo();
  repo.insertUser = async () => {
    throw Object.assign(new Error("duplicate key"), { code: "DATABASE_23505" });
  };
  const service = createService(repo, { random: () => 0.123456, sendSms: async () => {} });

  await service.sendVerificationCode({
    targetType: "phone",
    target: "+8613800138000",
    purpose: "register",
    captchaId: "c1",
    captchaAnswer: "ok",
  });

  await assert.rejects(
    () => service.registerPhone({ phone: "+8613800138000", code: "123456", password: "password" }),
    (error) => error.code === "AUTH_PHONE_ALREADY_REGISTERED",
  );
});

test("uses the fixed debug OTP only when explicitly injected by DEV configuration", async () => {
  const repo = createRepo();
  const sent = [];
  const service = createService(repo, { debugOtpCode: "123456", sendEmail: async (_email, code) => sent.push(code) });
  await service.sendVerificationCode({ targetType: "email", target: "debug@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok" });
  assert.deepEqual(sent, ["123456"]);
  await assert.doesNotReject(() => service.registerEmail({ email: "debug@example.com", code: "123456", password: "password" }));
});

test("records a safe send lifecycle without storing OTP plaintext", async () => {
  const repo = createRepo();
  const service = createService(repo, { sendEmail: async () => ({ provider: "brevo", messageId: "msg-1", deliveryStatus: "accepted", httpStatus: 201 }) });
  const result = await service.sendVerificationCode({ targetType: "email", target: "user@example.com", purpose: "register", captchaId: "c1", captchaAnswer: "ok", traceId: "trace-1" });
  assert.equal(result.verificationId, "verification-1");
  assert.equal(repo.verification[0].status, "sent");
  assert.equal(repo.verification[0].provider_message_id, "msg-1");
  assert.equal(repo.verification[0].trace_id, "trace-1");
  assert.equal("code" in repo.verification[0], false);
});

test("fails closed when the SMS provider is not configured", async () => {
  const repo = createRepo();
  const service = createService(repo);
  await assert.rejects(
    () => service.sendVerificationCode({ targetType: "phone", target: "+8613800138000", purpose: "register", captchaId: "c1", captchaAnswer: "ok" }),
    (error) => error.code === "AUTH_PROVIDER_UNAVAILABLE",
  );
  assert.equal(repo.verification.length, 1);
  assert.equal(repo.verification[0].status, "failed");
});

test("creates a new Google account and rejects automatic email merging", async () => {
  const repo = createRepo();
  const service = createService(repo, {
    verifyGoogleToken: async () => ({ sub: "google-sub-1", email: "google@example.com", email_verified: true }),
  });

  const created = await service.loginGoogle({ idToken: "google-id-token" });
  assert.equal(created.user.id, "user-1");
  assert.equal(repo.users[0].google_sub, "google-sub-1");
  assert.equal(repo.users[0].registration_channel, "google");

  repo.users.push({ id: "user-email", email_normalized: "existing@example.com", status: "active", token_version: 1, password_hash: "argon2id:password" });
  const conflictService = createService(repo, {
    verifyGoogleToken: async () => ({ sub: "google-sub-2", email: "existing@example.com", email_verified: true }),
  });
  await assert.rejects(() => conflictService.loginGoogle({ idToken: "google-id-token" }), (error) => error.code === "AUTH_EMAIL_ALREADY_REGISTERED");
});

test("keeps Google provider outages distinct from invalid credentials", async () => {
  const repo = createRepo();
  const service = createService(repo, {
    verifyGoogleToken: async () => {
      const error = new Error("Google verification timed out");
      error.code = "AUTH_PROVIDER_UNAVAILABLE";
      throw error;
    },
  });

  await assert.rejects(
    () => service.loginGoogle({ idToken: "google-id-token" }),
    (error) => error.code === "AUTH_PROVIDER_UNAVAILABLE",
  );
});
