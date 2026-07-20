const http = require("node:http");
const https = require("node:https");
const { URL, URLSearchParams } = require("node:url");
const { createProductSessionService, PublicLoginError, verifyAccessToken } = require("./product-session-service.cjs");
const { createProductDataService } = require("./product-data-service.cjs");

const MAX_BODY_BYTES = 4096;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...CORS_HEADERS,
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let raw = "";

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new PublicLoginError("REQUEST_TOO_LARGE", "请求无效"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        reject(new PublicLoginError("REQUEST_INVALID", "请求无效"));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new PublicLoginError("REQUEST_INVALID", "请求无效"));
      }
    });
    req.on("error", reject);
  });
}

function readRuntimeConfig(env) {
  const required = ["WX_APPID", "WX_SECRET", "TCB_ENV", "IDENTITY_HASH_PEPPER", "CLOUDBASE_APIKEY", "APP_SESSION_SECRET"];
  if (required.some((name) => typeof env[name] !== "string" || !env[name])) {
    throw new Error("Login service configuration is incomplete");
  }

  return {
    appId: env.WX_APPID,
    appSecret: env.WX_SECRET,
    cloudbaseEnvId: env.TCB_ENV,
    identityPepper: env.IDENTITY_HASH_PEPPER,
    cloudbaseApiKey: env.CLOUDBASE_APIKEY,
    sessionSecret: env.APP_SESSION_SECRET,
  };
}

function requestWechatSession({ appId, appSecret, code }) {
  const query = new URLSearchParams({
    appid: appId,
    secret: appSecret,
    js_code: code,
    grant_type: "authorization_code",
  });
  const requestUrl = `https://api.weixin.qq.com/sns/jscode2session?${query}`;

  return new Promise((resolve, reject) => {
    const request = https.get(requestUrl, { timeout: 5000 }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        try {
          const result = JSON.parse(raw);
          if (result.errcode || typeof result.openid !== "string" || !result.openid) {
            // The numeric code is safe operational telemetry. Never log the
            // one-time login code, AppSecret, or OpenID.
            console.warn("[wechat-login] code exchange rejected", { errcode: result.errcode ?? "OPENID_MISSING" });
            const error = new Error("WeChat code exchange was rejected");
            error.wechatErrorCode = Number.isInteger(result.errcode) ? result.errcode : undefined;
            reject(error);
            return;
          }
          resolve({ openid: result.openid });
        } catch {
          reject(new Error("WeChat response was invalid"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("WeChat code exchange timed out")));
    request.on("error", reject);
  });
}

function createRuntimeService(env = process.env) {
  const config = readRuntimeConfig(env);
  const cloudbase = require("@cloudbase/js-sdk");
  const app = cloudbase.init({
    env: config.cloudbaseEnvId,
    accessKey: config.cloudbaseApiKey,
    auth: { detectSessionInUrl: false },
  });
  const db = typeof app.rdb === "function" ? app.rdb() : app.rdb;
  if (!db || typeof db.from !== "function") throw new Error("Relational database client is unavailable");

  const session = createProductSessionService({
    exchangeCode: (code) => requestWechatSession({ ...config, code }),
    identityPepper: config.identityPepper,
    sessionSecret: config.sessionSecret,
    bootstrapUser: async (openidHash) => {
      const existing = await db.from("app_users").select("id").eq("openid_hash", openidHash).maybeSingle();
      if (existing.error) throw new Error("Product user lookup failed");

      let userId = existing.data?.id;
      if (!userId) {
        const created = await db.from("app_users").insert({ openid_hash: openidHash }).select("id").single();
        if (created.error || !created.data?.id) throw new Error("Product user creation failed");
        userId = created.data.id;
      }

      const profile = await db.from("profiles").select("onboarding_completed_at").eq("id", userId).maybeSingle();
      if (profile.error) throw new Error("Product profile lookup failed");
      return { userId, onboardingRequired: !profile.data?.onboarding_completed_at };
    },
  });
  return {
    issue: session.issue,
    verifySession: (token) => verifyAccessToken(token, config.sessionSecret),
    data: createProductDataService({ db }),
  };
}

function readBearerToken(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function getDataOperation(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  return ({ "/profile": "saveProfile", "/body-profile": "saveBodyProfile", "/goal": "saveGoal", "/onboarding": "saveOnboarding", "/account": "getAccount" })[path] ?? null;
}

function createHttpServer({ service }) {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    const dataOperation = getDataOperation(url.pathname);
    if (url.pathname !== "/" && url.pathname !== "/get-login-ticket" && !dataOperation) {
      sendJson(res, 404, { code: "NOT_FOUND" });
      return;
    }
    if (dataOperation === "getAccount" && req.method === "GET") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.data?.getAccount) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.getAccount(session.sub)); } catch { return sendJson(res, 503, { code: "ACCOUNT_READ_FAILED" }); }
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (!service) {
      sendJson(res, 503, { code: "LOGIN_SERVICE_NOT_CONFIGURED" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      if (dataOperation) {
        const session = service.verifySession?.(readBearerToken(req));
        if (!session?.sub || !service.data?.[dataOperation]) {
          sendJson(res, 401, { code: "UNAUTHORIZED" });
          return;
        }
        const result = await service.data[dataOperation](session.sub, body);
        sendJson(res, 200, result);
        return;
      }
      const result = await service.issue(body);
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof PublicLoginError) {
        const statusCode = error.code === "WECHAT_CODE_INVALID" || error.code === "REQUEST_INVALID" || error.code === "REQUEST_TOO_LARGE" ? 400 : 503;
        sendJson(res, statusCode, {
          code: error.code,
          ...(Number.isInteger(error.wechatErrorCode) ? { wechatErrorCode: error.wechatErrorCode } : {}),
        });
        return;
      }
      sendJson(res, 503, { code: "LOGIN_SERVICE_UNAVAILABLE" });
    }
  });
}

if (require.main === module) {
  let service = null;
  try {
    service = createRuntimeService();
  } catch {
    // Keep the public surface fail-closed until all required secrets are configured.
  }
  createHttpServer({ service }).listen(9000);
}

module.exports = {
  createHttpServer,
  createRuntimeService,
  readRuntimeConfig,
  requestWechatSession,
};
