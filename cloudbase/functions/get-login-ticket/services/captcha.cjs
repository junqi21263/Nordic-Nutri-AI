const { createHmac, randomUUID } = require("node:crypto");

const CAPTCHA_TTL_MS = 5 * 60 * 1000;
const CAPTCHA_MAX_ATTEMPTS = 5;

class CaptchaError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function hashCaptchaAnswer(answer, secret) {
  return createHmac("sha256", secret).update(`captcha:${String(answer).trim().toLowerCase()}`).digest("hex");
}

function createCaptchaService({ store, secret, create, id = randomUUID, now = Date.now } = {}) {
  const generator = create || (() => require("svg-captcha").create({
    size: 4,
    ignoreChars: "0o1i",
    noise: 1,
  }));
  const insert = store?.insert || store?.insertVerification;
  if (typeof insert !== "function" || !store || typeof store.find !== "function" || typeof store.update !== "function") {
    throw new Error("Captcha store is unavailable");
  }
  if (!secret) throw new Error("Captcha HMAC secret is unavailable");

  return {
    async getCaptcha() {
      const generated = generator();
      if (!generated || typeof generated.data !== "string" || typeof generated.text !== "string" || !generated.text) {
        throw new Error("Captcha generation failed");
      }
      const captchaId = id();
      await insert.call(store, {
        target: captchaId,
        target_type: "captcha",
        purpose: "captcha",
        code_hash: hashCaptchaAnswer(generated.text, secret),
        expires_at: new Date(now() + CAPTCHA_TTL_MS).toISOString(),
        attempt_count: 0,
        used_at: null,
        created_at: new Date(now()).toISOString(),
      });
      return { captchaId, image: generated.data, expiresIn: CAPTCHA_TTL_MS / 1000 };
    },

    async verifyCaptcha(captchaId, answer) {
      const row = await store.find(captchaId);
      if (!row || row.target_type !== "captcha" || row.purpose !== "captcha" || row.used_at) {
        throw new CaptchaError("AUTH_CAPTCHA_INVALID", "验证码无效");
      }
      if (new Date(row.expires_at).getTime() <= now()) {
        throw new CaptchaError("AUTH_CAPTCHA_EXPIRED", "验证码已过期");
      }
      if (Number(row.attempt_count) >= CAPTCHA_MAX_ATTEMPTS) {
        throw new CaptchaError("AUTH_CAPTCHA_INVALID", "验证码无效");
      }

      if (typeof store.consumeVerification === "function") {
        const consumed = await store.consumeVerification({
          target: captchaId,
          targetType: "captcha",
          purpose: "captcha",
          codeHash: hashCaptchaAnswer(answer, secret),
          now: now(),
        });
        if (consumed) return true;
        const current = await store.find(captchaId);
        if (!current || new Date(current.expires_at).getTime() <= now()) {
          throw new CaptchaError("AUTH_CAPTCHA_EXPIRED", "验证码已过期");
        }
        throw new CaptchaError("AUTH_CAPTCHA_INVALID", "验证码无效");
      }

      const expected = Buffer.from(row.code_hash, "utf8");
      const actual = Buffer.from(hashCaptchaAnswer(answer, secret), "utf8");
      const valid = expected.length === actual.length && require("node:crypto").timingSafeEqual(expected, actual);
      if (!valid) {
        await store.update(captchaId, { attempt_count: Number(row.attempt_count) + 1 });
        throw new CaptchaError("AUTH_CAPTCHA_INVALID", "验证码无效");
      }
      await store.update(captchaId, { used_at: new Date(now()).toISOString() });
      return true;
    },
  };
}

module.exports = { CAPTCHA_MAX_ATTEMPTS, CAPTCHA_TTL_MS, CaptchaError, createCaptchaService, hashCaptchaAnswer };
