const { createHmac, randomBytes, randomInt, timingSafeEqual } = require("node:crypto");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const VERIFICATION_PURPOSES = ["register", "reset_password", "bind"];
const VERIFICATION_LIMITS = {
  phone: { tenMinute: 3, daily: 10 },
  email: { tenMinute: 5, daily: 20 },
};

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 320) throw new AuthError("AUTH_INVALID_REQUEST", "邮箱无效");
  return email;
}

function normalizePhone(value) {
  const phone = typeof value === "string" ? value.replace(/[\s().-]/g, "") : "";
  if (!PHONE_PATTERN.test(phone)) throw new AuthError("AUTH_INVALID_REQUEST", "手机号无效");
  return phone;
}

function validatePassword(value) {
  if (typeof value !== "string" || value.length < 8 || value.length > 128) {
    throw new AuthError("AUTH_INVALID_REQUEST", "密码长度无效");
  }
  return value;
}

function generateOtp(random) {
  const value = typeof random === "function" ? Math.floor(random() * 1_000_000) : randomInt(0, 1_000_000);
  return String(value).padStart(6, "0");
}

function hashAuthValue(value, secret, purpose) {
  if (!secret) throw new Error("Auth HMAC secret is unavailable");
  return createHmac("sha256", secret).update(`${purpose}:${String(value)}`).digest("hex");
}

function hashVerificationCode(target, purpose, code, secret) {
  if (!secret) throw new Error("Auth HMAC secret is unavailable");
  return createHmac("sha256", secret).update(`${target}:${purpose}:${code}`).digest("hex");
}

function applyPurposeFilter(query, { purpose, purposes } = {}) {
  const values = Array.isArray(purposes) ? purposes : [purpose];
  const filtered = values.filter((value) => typeof value === "string" && value);
  return filtered.length > 1 ? query.in("purpose", filtered) : query.eq("purpose", filtered[0]);
}

function createAccessToken({ userId, tokenVersion, secret, now = Date.now }) {
  if (typeof userId !== "string" || !userId || !Number.isInteger(tokenVersion) || tokenVersion < 1) {
    throw new Error("Invalid access token input");
  }
  const issuedAt = Math.floor(now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    ver: tokenVersion,
    iat: issuedAt,
    exp: issuedAt + 60 * 60 * 24 * 7,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function verifyAccessToken(token, secret, { now = Date.now } = {}) {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !secret) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (
      typeof decoded?.sub !== "string" ||
      !decoded.sub ||
      !Number.isInteger(decoded.ver) ||
      decoded.ver < 1 ||
      !Number.isInteger(decoded.iat) ||
      !Number.isInteger(decoded.exp) ||
      decoded.exp <= Math.floor(now() / 1000)
    ) return null;
    return decoded;
  } catch {
    return null;
  }
}

function createPasswordService({ argon2 } = {}) {
  const implementation = argon2 || require("argon2");
  if (typeof implementation.hash !== "function" || typeof implementation.verify !== "function") {
    throw new Error("Argon2 password implementation is unavailable");
  }
  return {
    hash(password) {
      return implementation.hash(password, { type: implementation.argon2id });
    },
    verify(password, hash) {
      if (!hash) return false;
      return implementation.verify(hash, password);
    },
  };
}

function rpcBoolean(data, functionName) {
  const row = Array.isArray(data) ? data[0] : data;
  if (row === true || row === "true") return true;
  if (row && typeof row === "object" && (row[functionName] === true || row[functionName] === "true")) return true;
  return false;
}

function createAuthRepository(db) {
  if (!db || typeof db.from !== "function" || typeof db.rpc !== "function") {
    throw new Error("Auth database client is unavailable");
  }
  const userFields = "id,email,email_normalized,email_verified_at,email_login_enabled,phone_e164,phone_verified_at,password_hash,google_sub,status,token_version,created_platform,registration_channel,password_changed_at";
  const readUser = async (query) => {
    const result = await query.maybeSingle();
    if (result.error) throw new Error("Auth user lookup failed");
    return result.data ?? null;
  };
  return {
    async findUserByEmail(email) {
      return readUser(db.from("app_users").select(userFields).eq("email_normalized", email));
    },
    async findUserByPhone(phone) {
      return readUser(db.from("app_users").select(userFields).eq("phone_e164", phone));
    },
    async findUserByGoogleSub(googleSub) {
      return readUser(db.from("app_users").select(userFields).eq("google_sub", googleSub));
    },
    async findUserById(id) {
      return readUser(db.from("app_users").select(userFields).eq("id", id));
    },
    async insertUser(fields) {
      const result = await db.from("app_users").insert(fields).select(userFields).single();
      if (result.error || !result.data) {
        const error = new Error("Auth user creation failed");
        error.code = result.error?.code || "AUTH_USER_CREATE_FAILED";
        throw error;
      }
      return result.data;
    },
    async insertVerification(row) {
      const result = await db.from("auth_verification_codes").insert(row).select("id").single();
      if (result.error) throw new Error("Verification code creation failed");
      return result.data ?? null;
    },
    async find(target) {
      const result = await db.from("auth_verification_codes")
        .select("id,target,target_type,purpose,code_hash,expires_at,attempt_count,used_at,created_at")
        .eq("target", target)
        .eq("target_type", "captcha")
        .eq("purpose", "captcha")
        .is("used_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw new Error("Captcha lookup failed");
      return result.data ?? null;
    },
    async update(target, patch) {
      const result = await db.from("auth_verification_codes").update(patch).eq("target", target).eq("target_type", "captcha").eq("purpose", "captcha");
      if (result.error) throw new Error("Captcha update failed");
    },
    async invalidateVerification({ target, targetType, purpose }) {
      const result = await db.from("auth_verification_codes")
        .update({ status: "invalidated", invalidated_at: new Date().toISOString() })
        .eq("target", target)
        .eq("target_type", targetType)
        .eq("purpose", purpose)
        .is("used_at", null);
      if (result.error) throw new Error("Verification cleanup failed");
    },
    async countRecentVerification({ target, targetType, purpose, purposes, since }) {
      let query = db.from("auth_verification_codes")
        .select("id", { count: "exact", head: true })
        .eq("target", target)
        .eq("target_type", targetType)
        .gte("created_at", new Date(since).toISOString());
      query = applyPurposeFilter(query, { purpose, purposes });
      const result = await query;
      if (result.error) throw new Error("Verification rate lookup failed");
      return Number(result.count || 0);
    },
    async findLatestVerification({ target, targetType, purpose, purposes }) {
      let query = db.from("auth_verification_codes")
        .select("id,code_hash,created_at,expires_at,used_at,attempt_count,status")
        .eq("target", target)
        .eq("target_type", targetType)
        .is("used_at", null)
        .in("status", ["created", "sent"])
        .order("created_at", { ascending: false })
        .limit(1);
      query = applyPurposeFilter(query, { purpose, purposes });
      const result = await query.maybeSingle();
      if (result.error) throw new Error("Verification lookup failed");
      return result.data ?? null;
    },
    async findVerificationById(id) {
      const result = await db.from("auth_verification_codes")
        .select("id,target_value,target_type,purpose,status,used_at")
        .eq("id", id)
        .maybeSingle();
      if (result.error) throw new Error("Verification lookup failed");
      return result.data ?? null;
    },
    async updateVerification(id, patch) {
      const result = await db.from("auth_verification_codes").update(patch).eq("id", id);
      if (result.error) throw new Error("Verification update failed");
    },
    async consumeVerification({ target, targetType, purpose, codeHash, now = Date.now() }) {
      const result = await db.rpc("consume_auth_verification_code", {
        p_target: target,
        p_target_type: targetType,
        p_purpose: purpose,
        p_code_hash: codeHash,
        p_now: new Date(now).toISOString(),
      });
      if (result.error) throw new Error("Verification failed");
      return rpcBoolean(result.data, "consume_auth_verification_code") ? { consumed: true } : null;
    },
    async updatePassword(userId, passwordHash, targetType) {
      const result = await db.rpc("update_android_password_after_reset", {
        p_user_id: userId,
        p_password_hash: passwordHash,
        p_target_type: targetType,
      });
      if (result.error || !rpcBoolean(result.data, "update_android_password_after_reset")) throw new Error("Password update failed");
    },
    async bindContact({ userId, target, targetHash, targetType, codeHash, passwordHash, now }) {
      const result = await db.rpc("bind_android_contact", {
        p_user_id: userId,
        p_target: target,
        p_target_hash: targetHash,
        p_target_type: targetType,
        p_code_hash: codeHash,
        p_password_hash: passwordHash,
        p_now: new Date(now).toISOString(),
      });
      if (result.error) {
        // The RPC can commit even when the SDK reports a response error.
        // Confirm the exact code was consumed and the identity was written before reporting failure.
        const verification = await db.from("auth_verification_codes").select("id")
          .eq("user_id", userId).eq("target", targetHash).eq("target_type", targetType)
          .eq("purpose", "bind").eq("code_hash", codeHash).eq("status", "used")
          .gte("used_at", new Date(now - 10 * 60_000).toISOString()).maybeSingle();
        if (!verification.error && verification.data) {
          const user = await readUser(db.from("app_users").select(userFields).eq("id", userId));
          const matches = targetType === "email"
            ? user?.email_normalized === target && user.email_login_enabled
            : user?.phone_e164 === target;
          if (matches && user.password_hash) return "bound";
        }
        throw new Error("Account binding failed");
      }
      return typeof result.data === "string" ? result.data : result.data?.bind_android_contact;
    },
    async bindGoogleSub(userId, sub) {
      const result = await db.from("app_users").update({ google_sub: sub })
        .eq("id", userId).eq("status", "active").eq("created_platform", "android_app")
        .is("google_sub", null).select(userFields).maybeSingle();
      if (result.error) {
        if (["23505", "DATABASE_23505"].includes(result.error.code)) return "occupied";
        throw new Error("Google binding failed");
      }
      return result.data ?? null;
    },
    async insertRefreshSession(row) {
      const result = await db.from("auth_refresh_sessions").insert(row).select("id").single();
      if (result.error || !result.data?.id) throw new Error("Refresh session creation failed");
      return result.data;
    },
    async findRefreshSessionByHash(tokenHash) {
      const result = await db.from("auth_refresh_sessions")
        .select("id,user_id,token_hash,token_version,expires_at,revoked_at,replaced_by")
        .eq("token_hash", tokenHash)
        .maybeSingle();
      if (result.error) throw new Error("Refresh session lookup failed");
      return result.data ?? null;
    },
    async rotateRefreshSession({ oldTokenHash, newTokenHash, userId, tokenVersion, expiresAt, now }) {
      const result = await db.rpc("rotate_auth_refresh_session", {
        p_old_token_hash: oldTokenHash,
        p_new_token_hash: newTokenHash,
        p_user_id: userId,
        p_token_version: tokenVersion,
        p_new_expires_at: expiresAt,
        p_now: new Date(now).toISOString(),
      });
      if (result.error) throw new Error("Refresh session rotation failed");
      const value = Array.isArray(result.data) ? result.data[0] : result.data;
      if (typeof value === "string") return value;
      return value?.rotate_auth_refresh_session ?? null;
    },
    async revokeRefreshSession(tokenHash, revokedAt) {
      const result = await db.from("auth_refresh_sessions")
        .update({ revoked_at: new Date(revokedAt).toISOString(), last_used_at: new Date(revokedAt).toISOString() })
        .eq("token_hash", tokenHash)
        .is("revoked_at", null);
      if (result.error) throw new Error("Refresh session revocation failed");
      return true;
    },
  };
}

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function isUniqueViolation(error) {
  return ["23505", "DATABASE_23505", "UNIQUE_VIOLATION"].includes(error?.code);
}

function invalidGoogleCredentials(reason = "invalid_token") {
  const error = new AuthError("AUTH_INVALID_CREDENTIALS", "Google 登录凭证无效");
  error.authReason = reason;
  return error;
}

function unavailableProvider() {
  throw new AuthError("AUTH_PROVIDER_UNAVAILABLE", "验证码服务暂时不可用");
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email_normalized ?? null,
    emailVerified: Boolean(user.email_verified_at),
    ...(user.phone_e164 ? { phoneE164: user.phone_e164, phoneVerified: Boolean(user.phone_verified_at) } : {}),
    createdPlatform: user.created_platform ?? null,
    loginMethods: {
      email: Boolean(user.email_normalized && user.password_hash && user.email_login_enabled !== false),
      phone: Boolean(user.phone_e164 && user.password_hash),
      google: Boolean(user.google_sub),
    },
    hasPassword: Boolean(user.password_hash),
  };
}

function createAuthService({
  repo,
  authHmacSecret,
  sessionSecret,
  verifyCaptcha = async () => true,
  sendEmail = unavailableProvider,
  sendSms = unavailableProvider,
  verifyGoogleToken = null,
  hashPassword = async (password) => password,
  verifyPassword = async () => false,
  now = Date.now,
  random,
  generateRefreshToken = () => randomBytes(32).toString("base64url"),
  debugOtpCode = null,
} = {}) {
  if (!repo) throw new Error("Auth repository is unavailable");
  if (!authHmacSecret || !sessionSecret) throw new Error("Auth secrets are unavailable");
  // ponytail: process-local login limiter; use a shared store only if abuse or scale requires it.
  const loginFailures = new Map();
  const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
  const LOGIN_FAILURE_LIMIT = 5;

  function loginRateKeys(email, ip) {
    return [`email:${email}`, `ip:${typeof ip === "string" && ip.trim() ? ip.trim() : "unknown"}`];
  }

  function assertLoginRateAllowed(keys) {
    const timestamp = now();
    for (const key of keys) {
      const entry = loginFailures.get(key);
      if (entry && timestamp - entry.firstAttemptAt < LOGIN_FAILURE_WINDOW_MS && entry.count >= LOGIN_FAILURE_LIMIT) {
        throw new AuthError("AUTH_RATE_LIMITED", "操作过于频繁，请稍后重试");
      }
      if (entry && timestamp - entry.firstAttemptAt >= LOGIN_FAILURE_WINDOW_MS) loginFailures.delete(key);
    }
  }

  function recordLoginFailure(keys) {
    const timestamp = now();
    for (const key of keys) {
      const entry = loginFailures.get(key);
      if (!entry || timestamp - entry.firstAttemptAt >= LOGIN_FAILURE_WINDOW_MS) {
        loginFailures.set(key, { count: 1, firstAttemptAt: timestamp });
      } else {
        entry.count += 1;
      }
    }
  }

  function clearLoginFailures(keys) {
    for (const key of keys) loginFailures.delete(key);
  }

  const ACCESS_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
  const REFRESH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 30;

  function sessionResult(user, refreshToken) {
    const accessToken = createAccessToken({ userId: user.id, tokenVersion: user.token_version ?? 1, secret: sessionSecret, now });
    return {
      user: publicUser(user),
      session: {
        accessToken,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        refreshToken,
        refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
      },
      onboardingRequired: user.onboarding_required !== false,
    };
  }

  function refreshTokenHash(refreshToken) {
    return hashAuthValue(refreshToken, authHmacSecret, "refresh-token");
  }

  function invalidRefresh() {
    return new AuthError("AUTH_REFRESH_INVALID", "登录状态已失效");
  }

  async function issueSession(user) {
    const refreshToken = generateRefreshToken();
    if (typeof refreshToken !== "string" || refreshToken.length < 32 || refreshToken.length > 256) {
      throw new Error("Refresh token generator returned an invalid value");
    }
    await repo.insertRefreshSession({
      user_id: user.id,
      token_hash: refreshTokenHash(refreshToken),
      token_version: user.token_version ?? 1,
      expires_at: new Date(now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
    });
    return sessionResult(user, refreshToken);
  }

  function normalizeTarget(targetType, target) {
    if (targetType === "email") return normalizeEmail(target);
    if (targetType === "phone") return normalizePhone(target);
    throw new AuthError("AUTH_INVALID_REQUEST", "认证参数无效");
  }

  function findUserByTarget(targetType, normalized) {
    if (targetType === "email") return repo.findUserByEmail(normalized);
    if (targetType === "phone") return repo.findUserByPhone(normalized);
    throw new AuthError("AUTH_INVALID_REQUEST", "认证参数无效");
  }

  async function sendVerificationCode({ targetType, target, purpose = "register", captchaId, captchaAnswer, skipCaptcha = false, captchaVerified = false, bypassCooldown = false, traceId = null, userId = null }) {
    const normalized = normalizeTarget(targetType, target);
    if (!["register", "reset_password", "bind"].includes(purpose) || (purpose === "bind" && !userId)) {
      throw new AuthError("AUTH_INVALID_REQUEST", "验证码用途无效");
    }
    if (!skipCaptcha && !captchaVerified) await verifyCaptcha(captchaId, captchaAnswer);
    let linkedUserId = null;
    if (purpose === "reset_password") {
      const existing = await findUserByTarget(targetType, normalized);
      if (!existing) return { sent: true, expiresIn: 600, resendAfter: 60 };
      linkedUserId = existing.id ?? null;
    }
    const targetHash = hashAuthValue(normalized, authHmacSecret, `${targetType}-target`);
    const latest = await repo.findLatestVerification?.({ target: targetHash, targetType, purposes: VERIFICATION_PURPOSES });
    if (!bypassCooldown && latest && new Date(latest.created_at).getTime() + 60 * 1000 > now()) {
      throw new AuthError("AUTH_RATE_LIMITED", "操作过于频繁，请稍后重试");
    }
    const limits = VERIFICATION_LIMITS[targetType];
    const recentTenMinuteCount = await repo.countRecentVerification?.({
      target: targetHash,
      targetType,
      purposes: VERIFICATION_PURPOSES,
      since: now() - 10 * 60 * 1000,
    });
    if (Number(recentTenMinuteCount || 0) >= limits.tenMinute) {
      throw new AuthError("AUTH_RATE_LIMITED", "操作过于频繁，请稍后重试");
    }
    const recentDailyCount = await repo.countRecentVerification?.({
      target: targetHash,
      targetType,
      purposes: VERIFICATION_PURPOSES,
      since: now() - 24 * 60 * 60 * 1000,
    });
    if (Number(recentDailyCount || 0) >= limits.daily) {
      throw new AuthError("AUTH_RATE_LIMITED", "今日验证码发送次数已达上限，请明日再试");
    }
    await repo.invalidateVerification({ target: targetHash, targetType, purpose });
    const code = debugOtpCode || generateOtp(random);
    const created = await repo.insertVerification({
      target: targetHash,
      target_value: normalized,
      target_type: targetType,
      purpose,
      code_hash: hashVerificationCode(normalized, purpose, code, authHmacSecret),
      expires_at: new Date(now() + 10 * 60 * 1000).toISOString(),
      attempt_count: 0,
      used_at: null,
      status: "created",
      captcha_status: skipCaptcha ? "admin_resend" : "passed",
      rate_limit_status: bypassCooldown ? "admin_resend" : "allowed",
      send_attempt_count: 1,
      user_id: purpose === "bind" ? userId : linkedUserId,
      trace_id: traceId,
      created_at: new Date(now()).toISOString(),
    });
    const verificationId = created?.id ?? null;
    try {
      const delivery = targetType === "phone" ? await sendSms(normalized, code) : await sendEmail(normalized, code);
      if (verificationId && typeof repo.updateVerification === "function") {
        await repo.updateVerification(verificationId, {
          status: "sent",
          sent_at: new Date(now()).toISOString(),
          provider: delivery?.provider || (targetType === "phone" ? "spug" : "brevo"),
          provider_message_id: delivery?.messageId || null,
          provider_delivery_status: delivery?.deliveryStatus || "accepted",
          provider_http_status: delivery?.httpStatus ?? null,
        });
      }
    } catch (error) {
      if (verificationId && typeof repo.updateVerification === "function") {
        await repo.updateVerification(verificationId, {
          status: "failed",
          provider: error?.provider || (targetType === "phone" ? "spug" : "brevo"),
          provider_error_code: error?.providerErrorCode || error?.code || "AUTH_PROVIDER_UNAVAILABLE",
          provider_error_reason: "provider rejected or did not accept the message",
          provider_http_status: error?.providerHttpStatus ?? null,
        }).catch(() => {});
      } else await repo.invalidateVerification({ target: targetHash, targetType, purpose }).catch(() => {});
      throw new AuthError("AUTH_PROVIDER_UNAVAILABLE", "验证码服务暂时不可用");
    }
    return { sent: true, verificationId, expiresIn: 600, resendAfter: 60 };
  }

  async function consumeCode({ targetType, target, purpose, code }) {
    const normalized = normalizeTarget(targetType, target);
    const targetHash = hashAuthValue(normalized, authHmacSecret, `${targetType}-target`);
    const latest = await repo.findLatestVerification?.({ target: targetHash, targetType, purpose });
    if (latest && new Date(latest.expires_at).getTime() <= now()) {
      if (latest.id && typeof repo.updateVerification === "function") await repo.updateVerification(latest.id, { status: "expired" }).catch(() => {});
      throw new AuthError("AUTH_OTP_EXPIRED", "验证码已过期");
    }
    const codeHash = hashVerificationCode(normalized, purpose, code, authHmacSecret);
    const expected = typeof latest?.code_hash === "string" ? Buffer.from(latest.code_hash, "utf8") : null;
    const actual = Buffer.from(codeHash, "utf8");
    const matches = expected && expected.length === actual.length && timingSafeEqual(expected, actual);
    const result = await repo.consumeVerification({
      target: targetHash,
      targetType,
      purpose,
      codeHash,
      now: now(),
    });
    if (!result || (expected && !matches)) throw new AuthError("AUTH_OTP_INVALID", "验证码无效");
    return normalized;
  }

  async function resendVerificationCode({ verificationId, traceId = null }) {
    if (typeof repo.findVerificationById !== "function") throw new AuthError("AUTH_PROVIDER_UNAVAILABLE", "验证码服务暂时不可用");
    const row = await repo.findVerificationById(verificationId);
    if (!row || !row.target_value || !["email", "phone"].includes(row.target_type) || !["register", "reset_password"].includes(row.purpose)) {
      throw new AuthError("AUTH_INVALID_REQUEST", "验证码记录无效");
    }
    const result = await sendVerificationCode({
      targetType: row.target_type,
      target: row.target_value,
      purpose: row.purpose,
      skipCaptcha: true,
      bypassCooldown: true,
      traceId,
    });
    return { ...result, oldVerificationId: row.id, targetType: row.target_type, purpose: row.purpose };
  }

  async function registerEmail(input) {
    const normalized = await consumeCode({ targetType: "email", target: input.email, purpose: "register", code: input.code });
    validatePassword(input.password);
    const passwordHash = await hashPassword(input.password);
    const fields = { email: normalized, email_normalized: normalized, email_verified_at: new Date(now()).toISOString(), email_login_enabled: true, password_hash: passwordHash, created_platform: "android_app", registration_channel: "email" };
    try {
      return issueSession(await repo.insertUser(fields));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("AUTH_EMAIL_ALREADY_REGISTERED", "账号已存在");
      }
      throw error;
    }
  }

  async function registerPhone(input) {
    const normalized = await consumeCode({ targetType: "phone", target: input.phone, purpose: "register", code: input.code });
    validatePassword(input.password);
    const passwordHash = await hashPassword(input.password);
    const fields = { phone_e164: normalized, phone_verified_at: new Date(now()).toISOString(), password_hash: passwordHash, created_platform: "android_app", registration_channel: "phone" };
    try {
      return issueSession(await repo.insertUser(fields));
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("AUTH_PHONE_ALREADY_REGISTERED", "账号已存在");
      }
      throw error;
    }
  }

  async function loginEmail(input) {
    const normalized = normalizeEmail(input.email);
    const rateKeys = loginRateKeys(normalized, input.ip);
    assertLoginRateAllowed(rateKeys);
    const user = await repo.findUserByEmail(normalized);
    const valid = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || user.status !== "active" || user.email_login_enabled === false || !valid) {
      recordLoginFailure(rateKeys);
      throw new AuthError("AUTH_INVALID_CREDENTIALS", "账号或密码错误");
    }
    clearLoginFailures(rateKeys);
    return issueSession(user);
  }

  async function loginPhone(input) {
    const normalized = normalizePhone(input.phone);
    const rateKeys = loginRateKeys(normalized, input.ip);
    assertLoginRateAllowed(rateKeys);
    const user = await repo.findUserByPhone(normalized);
    const valid = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || user.status !== "active" || !valid) {
      recordLoginFailure(rateKeys);
      throw new AuthError("AUTH_INVALID_CREDENTIALS", "账号或密码错误");
    }
    clearLoginFailures(rateKeys);
    return issueSession(user);
  }

  async function loginGoogle({ idToken }) {
    if (typeof verifyGoogleToken !== "function") throw new AuthError("AUTH_PROVIDER_UNAVAILABLE", "Google 登录暂不可用");
    let claims;
    try {
      claims = await verifyGoogleToken(idToken);
    } catch (error) {
      if (error?.code === "AUTH_PROVIDER_UNAVAILABLE") throw error;
      const rejection = invalidGoogleCredentials(error?.authReason || "invalid_token");
      rejection.verificationAttempts = error?.verificationAttempts;
      throw rejection;
    }
    if (!claims?.sub) throw invalidGoogleCredentials("missing_subject");
    if (claims.email_verified !== true) throw invalidGoogleCredentials("email_unverified");
    const existingGoogleUser = await repo.findUserByGoogleSub(claims.sub);
    if (existingGoogleUser) {
      if (existingGoogleUser.status !== "active") throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态无效");
      return issueSession(existingGoogleUser);
    }
    let email;
    try {
      email = normalizeEmail(claims.email);
    } catch {
      throw invalidGoogleCredentials("email_invalid");
    }
    const existingEmailUser = await repo.findUserByEmail(email);
    if (existingEmailUser) throw new AuthError("AUTH_EMAIL_ALREADY_REGISTERED", "该邮箱已注册，请使用邮箱密码登录");
    try {
      const user = await repo.insertUser({
        email,
        email_normalized: email,
        email_verified_at: new Date(now()).toISOString(),
        google_sub: claims.sub,
        created_platform: "android_app",
        registration_channel: "google",
      });
      return issueSession(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AuthError("AUTH_EMAIL_ALREADY_REGISTERED", "该邮箱已注册，请使用邮箱密码登录");
      }
      throw error;
    }
  }

  async function resetPassword({ targetType = "email", email, phone, target, code, password }) {
    const value = target ?? (targetType === "phone" ? phone : email);
    const normalized = await consumeCode({ targetType, target: value, purpose: "reset_password", code });
    validatePassword(password);
    const user = await findUserByTarget(targetType, normalized);
    if (!user || user.status !== "active") throw new AuthError("AUTH_OTP_INVALID", "验证码无效");
    await repo.updatePassword(user.id, await hashPassword(password), targetType);
    return { reset: true };
  }

  async function getMe(token) {
    const user = await currentUser(token);
    return { user: publicUser(user) };
  }

  async function currentUser(token) {
    const session = verifyAccessToken(token, sessionSecret, { now });
    if (!session) throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态已失效");
    const user = await repo.findUserById(session.sub);
    if (!user || user.status !== "active" || user.token_version !== session.ver) {
      throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态已失效");
    }
    return user;
  }

  async function sendBindingCode(token, { targetType, target, captchaId, captchaAnswer, traceId }) {
    const user = await currentUser(token);
    if (user.created_platform !== "android_app") throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态无效");
    const normalized = normalizeTarget(targetType, target);
    await verifyCaptcha(captchaId, captchaAnswer);
    const current = targetType === "email" ? user.email_normalized : user.phone_e164;
    if (current && current !== normalized) throw new AuthError("AUTH_METHOD_ALREADY_BOUND", "此登录方式已绑定");
    if (current && user.password_hash) throw new AuthError("AUTH_METHOD_ALREADY_BOUND", "此登录方式已绑定");
    const owner = await findUserByTarget(targetType, normalized);
    if (owner && owner.id !== user.id) throw new AuthError("AUTH_IDENTITY_OCCUPIED", "此登录方式已被其他账号使用");
    return sendVerificationCode({ targetType, target: normalized, purpose: "bind", captchaId, captchaAnswer, captchaVerified: true, traceId, userId: user.id });
  }

  async function bindContact(token, { targetType, target, code, password }) {
    const user = await currentUser(token);
    if (user.created_platform !== "android_app") throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态无效");
    const normalized = normalizeTarget(targetType, target);
    if (!/^\d{6}$/.test(String(code || ""))) throw new AuthError("AUTH_OTP_INVALID", "验证码无效");
    let passwordHash = null;
    if (!user.password_hash) passwordHash = await hashPassword(validatePassword(password));
    const result = await repo.bindContact({
      userId: user.id,
      target: normalized,
      targetHash: hashAuthValue(normalized, authHmacSecret, `${targetType}-target`),
      targetType,
      codeHash: hashVerificationCode(normalized, "bind", code, authHmacSecret),
      passwordHash,
      now: now(),
    });
    const errors = {
      occupied: ["AUTH_IDENTITY_OCCUPIED", "此登录方式已被其他账号使用"],
      already_bound: ["AUTH_METHOD_ALREADY_BOUND", "此登录方式已绑定"],
      password_required: ["AUTH_PASSWORD_REQUIRED", "请设置登录密码"],
      expired_code: ["AUTH_OTP_EXPIRED", "验证码已过期"],
      invalid_code: ["AUTH_OTP_INVALID", "验证码无效"],
      unauthorized: ["AUTH_INVALID_CREDENTIALS", "登录状态已失效"],
    };
    if (result !== "bound") {
      const [errorCode, message] = errors[result] || ["AUTH_INVALID_REQUEST", "认证参数无效"];
      throw new AuthError(errorCode, message);
    }
    return { user: publicUser(await repo.findUserById(user.id)) };
  }

  async function bindGoogle(token, { idToken }) {
    const user = await currentUser(token);
    if (user.created_platform !== "android_app") throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态无效");
    if (user.google_sub) throw new AuthError("AUTH_METHOD_ALREADY_BOUND", "Google 已绑定");
    if (typeof verifyGoogleToken !== "function") throw new AuthError("AUTH_PROVIDER_UNAVAILABLE", "Google 登录暂不可用");
    let claims;
    try { claims = await verifyGoogleToken(idToken); }
    catch { throw invalidGoogleCredentials(); }
    if (!claims?.sub || claims.email_verified !== true) throw invalidGoogleCredentials();
    const owner = await repo.findUserByGoogleSub(claims.sub);
    if (owner && owner.id !== user.id) throw new AuthError("AUTH_IDENTITY_OCCUPIED", "Google 已被其他账号使用");
    const bound = await repo.bindGoogleSub(user.id, claims.sub);
    if (bound === "occupied") throw new AuthError("AUTH_IDENTITY_OCCUPIED", "Google 已被其他账号使用");
    if (!bound) throw new AuthError("AUTH_METHOD_ALREADY_BOUND", "Google 已绑定");
    return { user: publicUser(bound) };
  }

  async function refresh(refreshToken) {
    if (typeof refreshToken !== "string" || refreshToken.length < 32 || refreshToken.length > 256) throw invalidRefresh();
    const oldTokenHash = refreshTokenHash(refreshToken);
    const stored = await repo.findRefreshSessionByHash(oldTokenHash);
    if (!stored || stored.revoked_at || new Date(stored.expires_at).getTime() <= now()) throw invalidRefresh();
    const user = await repo.findUserById(stored.user_id);
    if (!user || user.status !== "active" || Number(user.token_version) !== Number(stored.token_version)) throw invalidRefresh();
    const nextRefreshToken = generateRefreshToken();
    const rotated = await repo.rotateRefreshSession({
      oldTokenHash,
      newTokenHash: refreshTokenHash(nextRefreshToken),
      userId: user.id,
      tokenVersion: user.token_version,
      expiresAt: new Date(now() + REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
      now: now(),
    });
    if (!rotated) throw invalidRefresh();
    return sessionResult(user, nextRefreshToken);
  }

  async function logout(refreshToken) {
    if (typeof refreshToken === "string" && refreshToken.length >= 32 && refreshToken.length <= 256) {
      await repo.revokeRefreshSession(refreshTokenHash(refreshToken), now());
    }
    return { signedOut: true };
  }

  return {
    loginEmail,
    loginPhone,
    loginGoogle,
    registerEmail,
    registerPhone,
    resetPassword,
    sendVerificationCode,
    resendVerificationCode,
    getMe,
    sendBindingCode,
    bindContact,
    bindGoogle,
    refresh,
    logout,
  };
}

module.exports = {
  AuthError,
  createAccessToken,
  createAuthService,
  createAuthRepository,
  createPasswordService,
  generateOtp,
  hashAuthValue,
  hashVerificationCode,
  normalizeEmail,
  normalizePhone,
  validatePassword,
  verifyAccessToken,
};
