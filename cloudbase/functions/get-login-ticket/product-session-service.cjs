const { createHmac, timingSafeEqual } = require("node:crypto");

class PublicLoginError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function hashOpenId(openid, pepper) {
  return createHmac("sha256", pepper).update(`openid:${openid}`).digest("hex");
}

function createAccessToken(userId, sessionSecret, now) {
  const issuedAt = Math.floor(now() / 1000);
  const payload = Buffer.from(JSON.stringify({ sub: userId, iat: issuedAt, exp: issuedAt + 60 * 60 * 24 * 7 })).toString("base64url");
  const signature = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

function validateCode(input) {
  if (typeof input?.code !== "string" || !input.code.trim()) {
    throw new PublicLoginError("WECHAT_CODE_INVALID", "登录凭证无效");
  }
  return input.code.trim();
}

function createProductSessionService({ exchangeCode, bootstrapUser, identityPepper, sessionSecret, onBootstrapError, now = Date.now }) {
  return {
    async issue(input) {
      const code = validateCode(input);
      let openid;
      try {
        ({ openid } = await exchangeCode(code));
        if (typeof openid !== "string" || !openid) throw new Error("WeChat did not return an OpenID");
      } catch (error) {
        if (error instanceof PublicLoginError) throw error;
        const publicError = new PublicLoginError("WECHAT_LOGIN_FAILED", "登录服务暂时不可用");
        if (Number.isInteger(error?.wechatErrorCode)) publicError.wechatErrorCode = error.wechatErrorCode;
        throw publicError;
      }

      try {
        const productUser = await bootstrapUser(hashOpenId(openid, identityPepper));
        if (!productUser?.userId) throw new Error("Product user bootstrap failed");
        return {
          user: { id: productUser.userId },
          session: { accessToken: createAccessToken(productUser.userId, sessionSecret, now) },
          onboardingRequired: Boolean(productUser.onboardingRequired),
        };
      } catch (error) {
        if (typeof onBootstrapError === "function") {
          try { onBootstrapError(error); } catch { /* diagnostics must never affect login */ }
        }
        throw new PublicLoginError("PRODUCT_SESSION_FAILED", "用户资料服务暂时不可用");
      }
    },
  };
}

function verifyAccessToken(token, sessionSecret) {
  if (typeof token !== "string") return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", sessionSecret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof decoded?.sub === "string" && typeof decoded?.exp === "number" && decoded.exp > Math.floor(Date.now() / 1000) ? decoded : null;
  } catch {
    return null;
  }
}

module.exports = { PublicLoginError, createProductSessionService, hashOpenId, verifyAccessToken };
