const { createHmac, timingSafeEqual } = require("node:crypto");

class PublicAdminAuthError extends Error {
  constructor(code, message = "管理员登录失败") {
    super(message);
    this.code = code;
  }
}

function safeEqualText(left, right) {
  const a = Buffer.from(String(left || ""), "utf8");
  const b = Buffer.from(String(right || ""), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function createAdminAccessToken(userId, sessionSecret, now = Date.now) {
  const issuedAt = Math.floor(now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    sub: userId,
    role: "admin_console",
    iat: issuedAt,
    exp: issuedAt + 60 * 60 * 24 * 7,
  })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function createAdminConsoleAuthService({
  db,
  sessionSecret,
  identityPepper,
  username,
  password,
  now = Date.now,
}) {
  const configuredUser = typeof username === "string" ? username.trim() : "";
  const configuredPass = typeof password === "string" ? password : "";
  if (!sessionSecret || !identityPepper) throw new Error("Admin console auth dependencies are unavailable");

  async function ensureActor() {
    if (!db || typeof db.from !== "function") throw new Error("Admin console database is unavailable");
    const openidHash = createHmac("sha256", identityPepper).update("admin-console:operator").digest("hex");
    const existing = await db.from("app_users").select("id,is_admin").eq("openid_hash", openidHash).maybeSingle();
    if (existing?.error) throw new Error("Admin actor lookup failed");
    if (existing?.data?.id) {
      if (!existing.data.is_admin) {
        await db.from("app_users").update({ is_admin: true }).eq("id", existing.data.id);
      }
      return existing.data.id;
    }
    const created = await db.from("app_users").insert({ openid_hash: openidHash, is_admin: true }).select("id").single();
    if (created?.error || !created?.data?.id) throw new Error("Admin actor creation failed");
    return created.data.id;
  }

  return {
    isConfigured() {
      return Boolean(configuredUser && configuredPass);
    },
    async login(input) {
      if (!configuredUser || !configuredPass) {
        throw new PublicAdminAuthError("ADMIN_AUTH_NOT_CONFIGURED", "后台帐号密码未配置");
      }
      const inputUser = typeof input?.username === "string" ? input.username.trim() : "";
      const inputPass = typeof input?.password === "string" ? input.password : "";
      if (!safeEqualText(inputUser, configuredUser) || !safeEqualText(inputPass, configuredPass)) {
        throw new PublicAdminAuthError("ADMIN_AUTH_INVALID", "帐号或密码错误");
      }
      try {
        const userId = await ensureActor();
        return {
          user: { id: userId },
          session: { accessToken: createAdminAccessToken(userId, sessionSecret, now) },
        };
      } catch (error) {
        console.error("[admin-auth] actor bootstrap failed:", error?.message || error);
        throw new PublicAdminAuthError("ADMIN_AUTH_FAILED", "管理员会话创建失败");
      }
    },
  };
}

module.exports = {
  PublicAdminAuthError,
  createAdminAccessToken,
  createAdminConsoleAuthService,
};
