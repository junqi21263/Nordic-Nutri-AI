import assert from "node:assert/strict";
import test from "node:test";

import { createAccessToken, createAuthRepository, createAuthService, hashAuthValue, hashVerificationCode } from "./services/auth.cjs";

function createRepo(clock = () => 1_700_000_000_000) {
  const repo = {
    users: [],
    verification: [],
    refreshSessions: [],
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
    async insertRefreshSession(row) { const created = { id: `refresh-${this.refreshSessions.length + 1}`, ...row }; this.refreshSessions.push(created); return created; },
    async findRefreshSessionByHash(tokenHash) { return this.refreshSessions.find((item) => item.token_hash === tokenHash) ?? null; },
    async rotateRefreshSession({ oldTokenHash, newTokenHash, userId, tokenVersion, expiresAt, now }) {
      const old = this.refreshSessions.find((item) => item.token_hash === oldTokenHash && !item.revoked_at);
      if (!old || old.user_id !== userId || old.token_version !== tokenVersion || new Date(old.expires_at).getTime() <= now) return null;
      const created = { id: `refresh-${this.refreshSessions.length + 1}`, user_id: userId, token_hash: newTokenHash, token_version: tokenVersion, expires_at: expiresAt };
      this.refreshSessions.push(created);
      old.revoked_at = new Date(now).toISOString();
      old.replaced_by = created.id;
      return created.id;
    },
    async revokeRefreshSession(tokenHash, revokedAt) {
      const row = this.refreshSessions.find((item) => item.token_hash === tokenHash && !item.revoked_at);
      if (row) row.revoked_at = new Date(revokedAt).toISOString();
      return Boolean(row);
    },
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

test("recognizes a committed contact binding when the RPC response fails", async () => {
  const now = 1_700_000_000_000;
  const queries = [];
  let codeConsumed = true;
  const db = {
    from(table) {
      const filters = [];
      const query = {
        select() { return this; },
        eq(key, value) { filters.push([key, value]); return this; },
        gte(key, value) { filters.push([key, value]); return this; },
        async maybeSingle() {
          queries.push({ table, filters });
          if (table === "auth_verification_codes") return { data: codeConsumed ? { id: "used-code" } : null, error: null };
          return { data: { id: "user-1", email_normalized: "new@example.com", email_login_enabled: true, password_hash: "stored-hash" }, error: null };
        },
      };
      return query;
    },
    async rpc() { return { data: null, error: { code: "PARSING_FAILED" } }; },
  };
  const repo = createAuthRepository(db);
  const input = { userId: "user-1", target: "new@example.com", targetHash: "target-hash", targetType: "email", codeHash: "code-hash", passwordHash: "new-hash", now };

  assert.equal(await repo.bindContact(input), "bound");
  assert.deepEqual(queries[0], {
    table: "auth_verification_codes",
    filters: [
      ["user_id", "user-1"], ["target", "target-hash"], ["target_type", "email"],
      ["purpose", "bind"], ["code_hash", "code-hash"], ["status", "used"],
      ["used_at", new Date(now - 10 * 60_000).toISOString()],
    ],
  });
  codeConsumed = false;
  await assert.rejects(repo.bindContact(input), /Account binding failed/);
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

test("/auth/me returns the current account and available login methods", async () => {
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
      loginMethods: { email: true, phone: false, google: false },
      hasPassword: true,
    },
  });
});

test("binding code requires the current Android session and rejects another account's email", async () => {
  const repo = createRepo();
  repo.users.push(
    { id: "current", phone_e164: "+8613800138000", password_hash: "argon2id:password", status: "active", created_platform: "android_app", token_version: 1 },
    { id: "other", email_normalized: "taken@example.com", status: "active", created_platform: "android_app", token_version: 1 },
  );
  const service = createService(repo);
  const session = await service.loginPhone({ phone: "+8613800138000", password: "password" });
  await assert.rejects(service.sendBindingCode("bad", { targetType: "email", target: "new@example.com" }), { code: "AUTH_INVALID_CREDENTIALS" });
  await assert.rejects(service.sendBindingCode(session.session.accessToken, { targetType: "email", target: "taken@example.com" }), { code: "AUTH_IDENTITY_OCCUPIED" });
  assert.equal(repo.verification.length, 0);
  await service.sendBindingCode(session.session.accessToken, { targetType: "email", target: " NEW@example.com ", captchaId: "c1", captchaAnswer: "ok" });
  assert.equal(repo.verification[0].user_id, "current");
  assert.equal(repo.verification[0].purpose, "bind");
  assert.equal(repo.verification[0].target_value, "new@example.com");
});

test("contact binding passes current user to the atomic repository and keeps the same account", async () => {
  const repo = createRepo();
  const user = { id: "current", google_sub: "google-1", status: "active", created_platform: "android_app", token_version: 1 };
  repo.users.push(user);
  repo.bindContact = async (input) => {
    assert.equal(input.userId, "current");
    assert.equal(input.target, "new@example.com");
    assert.equal(input.targetHash, hashAuthValue("new@example.com", "auth-secret", "email-target"));
    assert.equal(input.codeHash, hashVerificationCode("new@example.com", "bind", "123456", "auth-secret"));
    assert.equal(input.passwordHash, "argon2id:password");
    user.email_normalized = input.target;
    user.password_hash = input.passwordHash;
    return "bound";
  };
  const service = createService(repo);
  const token = createAccessToken({ userId: "current", tokenVersion: 1, secret: "session-secret", now: () => 1_700_000_000_000 });
  const result = await service.bindContact(token, { targetType: "email", target: "NEW@example.com", code: "123456", password: "password" });
  assert.equal(result.user.id, "current");
  assert.deepEqual(result.user.loginMethods, { email: true, phone: false, google: true });
});

test("Google binding rejects an occupied subject and never creates a second user", async () => {
  const repo = createRepo();
  repo.users.push(
    { id: "current", phone_e164: "+8613800138000", password_hash: "argon2id:password", status: "active", created_platform: "android_app", token_version: 1 },
    { id: "other", google_sub: "google-1", status: "active", created_platform: "android_app", token_version: 1 },
  );
  const service = createService(repo, { verifyGoogleToken: async () => ({ sub: "google-1", email_verified: true }) });
  const session = await service.loginPhone({ phone: "+8613800138000", password: "password" });
  await assert.rejects(service.bindGoogle(session.session.accessToken, { idToken: "token" }), { code: "AUTH_IDENTITY_OCCUPIED" });
  assert.equal(repo.users.length, 2);
});

test("a Google account's email stays unavailable after it binds a phone", async () => {
  const repo = createRepo();
  repo.users.push({
    id: "google-user", email_normalized: "google@example.com", email_verified_at: "2026-10-14T00:00:00Z",
    email_login_enabled: false, google_sub: "google-1", phone_e164: "+8613800138000",
    password_hash: "argon2id:password", status: "active", created_platform: "android_app", token_version: 1,
  });
  const service = createService(repo);
  await assert.rejects(service.loginEmail({ email: "google@example.com", password: "password" }), { code: "AUTH_INVALID_CREDENTIALS" });
  const phoneSession = await service.loginPhone({ phone: "+8613800138000", password: "password" });
  assert.deepEqual(phoneSession.user.loginMethods, { email: false, phone: true, google: true });
});

test("issues only a hashed 30-day refresh session beside the seven-day access token", async () => {
  const repo = createRepo();
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:password", status: "active", token_version: 1 });
  const service = createService(repo);

  const result = await service.loginEmail({ email: "user@example.com", password: "password" });

  assert.equal(result.session.expiresIn, 60 * 60 * 24 * 7);
  assert.equal(result.session.refreshExpiresIn, 60 * 60 * 24 * 30);
  assert.equal(typeof result.session.refreshToken, "string");
  assert.equal(repo.refreshSessions[0].token_hash.length, 64);
  assert.notEqual(repo.refreshSessions[0].token_hash, result.session.refreshToken);
  assert.equal(repo.refreshSessions[0].user_id, "user-1");
});

test("rotates refresh tokens once and rejects replay", async () => {
  const repo = createRepo();
  repo.users.push({ id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:password", status: "active", token_version: 1 });
  const service = createService(repo);
  const login = await service.loginEmail({ email: "user@example.com", password: "password" });

  const rotated = await service.refresh(login.session.refreshToken);

  assert.notEqual(rotated.session.refreshToken, login.session.refreshToken);
  assert.equal(repo.refreshSessions[0].replaced_by, repo.refreshSessions[1].id);
  await assert.rejects(
    () => service.refresh(login.session.refreshToken),
    (error) => error.code === "AUTH_REFRESH_INVALID",
  );
});

test("rejects refresh after token-version change and revokes one device on logout", async () => {
  const repo = createRepo();
  const user = { id: "user-1", email_normalized: "user@example.com", password_hash: "argon2id:password", status: "active", token_version: 1 };
  repo.users.push(user);
  const service = createService(repo);
  const first = await service.loginEmail({ email: "user@example.com", password: "password" });
  const second = await service.loginEmail({ email: "user@example.com", password: "password" });

  await service.logout(first.session.refreshToken);
  assert.ok(repo.refreshSessions[0].revoked_at);
  assert.equal(repo.refreshSessions[1].revoked_at, undefined);
  await assert.doesNotReject(() => service.refresh(second.session.refreshToken));

  const third = await service.loginEmail({ email: "user@example.com", password: "password" });
  user.token_version = 2;
  await assert.rejects(
    () => service.refresh(third.session.refreshToken),
    (error) => error.code === "AUTH_REFRESH_INVALID",
  );
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
