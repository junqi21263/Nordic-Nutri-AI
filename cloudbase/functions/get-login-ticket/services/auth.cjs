const { createHmac, randomInt, timingSafeEqual } = require("node:crypto");

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

function normalizeEmail(value) {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || email.length > 320) throw new AuthError("AUTH_INVALID_REQUEST", "邮箱无效");
  return email;
}

function normalizePhone(value) {
  const phone = typeof value === "string" ? value.trim() : "";
  if (!E164_PATTERN.test(phone)) throw new AuthError("AUTH_INVALID_REQUEST", "手机号无效");
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
  const userFields = "id,email,email_normalized,email_verified_at,phone_e164,phone_verified_at,password_hash,google_sub,status,token_version";
  const readUser = async (query) => {
    const result = await query.maybeSingle();
    if (result.error) throw new Error("Auth user lookup failed");
    return result.data ?? null;
  };
  return {
    async findUserByEmail(email) {
      return readUser(db.from("app_users").select(userFields).eq("email_normalized", email));
    },
    async findUserByEmailForGoogle(email) {
      return readUser(db.from("app_users").select(userFields).eq("email_normalized", email));
    },
    async findUserByGoogleSub(sub) {
      return readUser(db.from("app_users").select(userFields).eq("google_sub", sub));
    },
    async findUserByPhone(phone) {
      return readUser(db.from("app_users").select(userFields).eq("phone_e164", phone));
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
        .update({ used_at: new Date().toISOString() })
        .eq("target", target)
        .eq("target_type", targetType)
        .eq("purpose", purpose)
        .is("used_at", null);
      if (result.error) throw new Error("Verification cleanup failed");
    },
    async countRecentVerification({ target, targetType, purpose, since }) {
      const result = await db.from("auth_verification_codes")
        .select("id", { count: "exact", head: true })
        .eq("target", target)
        .eq("target_type", targetType)
        .eq("purpose", purpose)
        .gte("created_at", new Date(since).toISOString());
      if (result.error) throw new Error("Verification rate lookup failed");
      return Number(result.count || 0);
    },
    async findLatestVerification({ target, targetType, purpose }) {
      const result = await db.from("auth_verification_codes")
        .select("id,created_at,expires_at,used_at,attempt_count")
        .eq("target", target)
        .eq("target_type", targetType)
        .eq("purpose", purpose)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (result.error) throw new Error("Verification lookup failed");
      return result.data ?? null;
    },
    async consumeVerification({ target, targetType, purpose, codeHash }) {
      const result = await db.rpc("consume_auth_verification_code", {
        p_target: target,
        p_target_type: targetType,
        p_purpose: purpose,
        p_code_hash: codeHash,
      });
      if (result.error) throw new Error("Verification failed");
      return rpcBoolean(result.data, "consume_auth_verification_code") ? { consumed: true } : null;
    },
    async updatePassword(userId, passwordHash) {
      const result = await db.rpc("update_app_user_password", {
        p_user_id: userId,
        p_password_hash: passwordHash,
      });
      if (result.error || !rpcBoolean(result.data, "update_app_user_password")) throw new Error("Password update failed");
    },
  };
}

class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email_normalized ?? null,
    phone: user.phone_e164 ?? null,
  };
}

function createAuthService({
  repo,
  authHmacSecret,
  sessionSecret,
  verifyCaptcha = async () => true,
  verifyGoogleToken = async () => { throw new Error("Google verification is unavailable"); },
  sendEmail = async () => {},
  sendSms = async () => {},
  hashPassword = async (password) => password,
  verifyPassword = async () => false,
  now = Date.now,
  random,
} = {}) {
  if (!repo) throw new Error("Auth repository is unavailable");
  if (!authHmacSecret || !sessionSecret) throw new Error("Auth secrets are unavailable");

  function issueSession(user) {
    const token = createAccessToken({ userId: user.id, tokenVersion: user.token_version ?? 1, secret: sessionSecret, now });
    return {
      user: publicUser(user),
      session: { accessToken: token, expiresIn: 60 * 60 * 24 * 7 },
      onboardingRequired: user.onboarding_required !== false,
    };
  }

  function normalizeTarget(targetType, target) {
    if (targetType === "email") return normalizeEmail(target);
    if (targetType === "phone") return normalizePhone(target);
    throw new AuthError("AUTH_INVALID_REQUEST", "认证参数无效");
  }

  async function sendVerificationCode({ targetType, target, purpose = "register", captchaId, captchaAnswer }) {
    const normalized = normalizeTarget(targetType, target);
    await verifyCaptcha(captchaId, captchaAnswer);
    if (purpose === "forgot_password") {
      const existing = targetType === "email"
        ? await repo.findUserByEmail(normalized)
        : await repo.findUserByPhone(normalized);
      if (!existing) return { sent: true, expiresIn: 600, resendAfter: 60 };
    }
    const targetHash = hashAuthValue(normalized, authHmacSecret, targetType);
    const latest = await repo.findLatestVerification?.({ target: targetHash, targetType, purpose });
    if (latest && new Date(latest.created_at).getTime() + 60 * 1000 > now()) {
      throw new AuthError("AUTH_RATE_LIMITED", "操作过于频繁，请稍后重试");
    }
    const hourlyLimit = targetType === "phone" ? 3 : 5;
    const recentCount = await repo.countRecentVerification?.({
      target: targetHash,
      targetType,
      purpose,
      since: now() - 60 * 60 * 1000,
    });
    if (Number(recentCount || 0) >= hourlyLimit) {
      throw new AuthError("AUTH_RATE_LIMITED", "操作过于频繁，请稍后重试");
    }
    await repo.invalidateVerification({ target: targetHash, targetType, purpose });
    const code = generateOtp(random);
    await repo.insertVerification({
      target: targetHash,
      target_type: targetType,
      purpose,
      code_hash: hashAuthValue(code, authHmacSecret, "otp"),
      expires_at: new Date(now() + 10 * 60 * 1000).toISOString(),
      attempt_count: 0,
      used_at: null,
      created_at: new Date(now()).toISOString(),
    });
    try {
      if (targetType === "email") await sendEmail(normalized, code);
      else await sendSms(normalized, code);
    } catch {
      await repo.invalidateVerification({ target: targetHash, targetType, purpose });
      throw new AuthError("AUTH_PROVIDER_UNAVAILABLE", "验证码服务暂时不可用");
    }
    return { sent: true, expiresIn: 600, resendAfter: 60 };
  }

  async function consumeCode({ targetType, target, purpose, code }) {
    const normalized = normalizeTarget(targetType, target);
    const targetHash = hashAuthValue(normalized, authHmacSecret, targetType);
    const latest = await repo.findLatestVerification?.({ target: targetHash, targetType, purpose });
    if (latest && new Date(latest.expires_at).getTime() <= now()) {
      throw new AuthError("AUTH_OTP_EXPIRED", "验证码已过期");
    }
    const result = await repo.consumeVerification({
      target: targetHash,
      targetType,
      purpose,
      codeHash: hashAuthValue(code, authHmacSecret, "otp"),
      now: now(),
    });
    if (!result) throw new AuthError("AUTH_OTP_INVALID", "验证码无效");
    return normalized;
  }

  async function register(targetType, input) {
    const normalized = await consumeCode({ targetType, target: input[targetType === "email" ? "email" : "phone"], purpose: "register", code: input.code });
    validatePassword(input.password);
    const passwordHash = await hashPassword(input.password);
    const fields = targetType === "email"
      ? { email: normalized, email_normalized: normalized, email_verified_at: new Date(now()).toISOString(), password_hash: passwordHash, created_platform: "android_app" }
      : { phone_e164: normalized, phone_verified_at: new Date(now()).toISOString(), password_hash: passwordHash, created_platform: "android_app" };
    try {
      return issueSession(await repo.insertUser(fields));
    } catch (error) {
      if (error?.code === "UNIQUE_VIOLATION" || error?.code === "23505") {
        throw new AuthError(targetType === "email" ? "AUTH_EMAIL_ALREADY_REGISTERED" : "AUTH_PHONE_ALREADY_REGISTERED", "账号已存在");
      }
      throw error;
    }
  }

  async function login(targetType, input) {
    await verifyCaptcha(input.captchaId, input.captchaAnswer);
    const normalized = normalizeTarget(targetType, input[targetType === "email" ? "email" : "phone"]);
    const user = targetType === "email" ? await repo.findUserByEmail(normalized) : await repo.findUserByPhone(normalized);
    const valid = await verifyPassword(input.password, user?.password_hash ?? null);
    if (!user || user.status !== "active" || !valid) throw new AuthError("AUTH_INVALID_CREDENTIALS", "账号或密码错误");
    return issueSession(user);
  }

  async function loginGoogle(idToken) {
    let identity;
    try {
      identity = await verifyGoogleToken(idToken);
    } catch {
      throw new AuthError("AUTH_INVALID_CREDENTIALS", "Google 登录失败");
    }
    if (!identity?.sub) throw new AuthError("AUTH_INVALID_CREDENTIALS", "Google 登录失败");
    const existingGoogle = await repo.findUserByGoogleSub(identity.sub);
    if (existingGoogle) {
      if (existingGoogle.status !== "active") throw new AuthError("AUTH_INVALID_CREDENTIALS", "Google 登录失败");
      return issueSession(existingGoogle);
    }
    const normalizedEmail = identity.email ? normalizeEmail(identity.email) : null;
    if (normalizedEmail && await repo.findUserByEmailForGoogle(normalizedEmail)) {
      throw new AuthError("AUTH_EMAIL_ALREADY_REGISTERED", "该邮箱已注册，请使用邮箱密码登录");
    }
    const user = await repo.insertUser({
      email: normalizedEmail,
      email_normalized: normalizedEmail,
      email_verified_at: identity.email_verified ? new Date(now()).toISOString() : null,
      google_sub: identity.sub,
      created_platform: "android_app",
    });
    return issueSession(user);
  }

  async function resetPassword({ targetType, target, code, password }) {
    const normalized = await consumeCode({ targetType, target, purpose: "forgot_password", code });
    validatePassword(password);
    const user = targetType === "email" ? await repo.findUserByEmail(normalized) : await repo.findUserByPhone(normalized);
    if (!user || user.status !== "active") throw new AuthError("AUTH_OTP_INVALID", "验证码无效");
    await repo.updatePassword(user.id, await hashPassword(password));
    return { reset: true };
  }

  async function getMe(token) {
    const session = verifyAccessToken(token, sessionSecret, { now });
    if (!session) throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态已失效");
    const user = await repo.findUserById(session.sub);
    if (!user || user.status !== "active" || user.token_version !== session.ver) {
      throw new AuthError("AUTH_INVALID_CREDENTIALS", "登录状态已失效");
    }
    return { user: publicUser(user) };
  }

  return {
    loginEmail: (input) => login("email", input),
    loginGoogle,
    loginPhone: (input) => login("phone", input),
    registerEmail: (input) => register("email", input),
    registerPhone: (input) => register("phone", input),
    resetPassword,
    sendVerificationCode,
    getMe,
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
  normalizeEmail,
  normalizePhone,
  validatePassword,
  verifyAccessToken,
};
