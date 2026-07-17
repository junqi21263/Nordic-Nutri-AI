const http = require("node:http");
const https = require("node:https");
const { URL, URLSearchParams } = require("node:url");
const { createTicketService, PublicTicketError } = require("./ticket-service.cjs");

const MAX_BODY_BYTES = 4096;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
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
        reject(new PublicTicketError("REQUEST_TOO_LARGE", "请求无效"));
        req.destroy();
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      if (!raw) {
        reject(new PublicTicketError("REQUEST_INVALID", "请求无效"));
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new PublicTicketError("REQUEST_INVALID", "请求无效"));
      }
    });
    req.on("error", reject);
  });
}

function readRuntimeConfig(env) {
  const required = ["WX_APPID", "WX_SECRET", "TCB_ENV", "IDENTITY_HASH_PEPPER", "CUSTOM_LOGIN_CREDENTIALS_JSON"];
  if (required.some((name) => typeof env[name] !== "string" || !env[name])) {
    throw new Error("Ticket service configuration is incomplete");
  }

  let credentials;
  try {
    credentials = JSON.parse(env.CUSTOM_LOGIN_CREDENTIALS_JSON);
  } catch {
    throw new Error("Custom Login credentials are invalid");
  }

  return {
    appId: env.WX_APPID,
    appSecret: env.WX_SECRET,
    cloudbaseEnvId: env.TCB_ENV,
    credentials,
    identityPepper: env.IDENTITY_HASH_PEPPER,
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
            reject(new Error("WeChat code exchange was rejected"));
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
  const cloudbase = require("@cloudbase/node-sdk");
  const app = cloudbase.init({ env: config.cloudbaseEnvId, credentials: config.credentials });

  return createTicketService({
    exchangeCode: (code) => requestWechatSession({ ...config, code }),
    createTicket: (openid) => app.auth().createTicket(openid, { refresh: 3600 * 1000 }),
    identityPepper: config.identityPepper,
  });
}

function createHttpServer({ service }) {
  return http.createServer(async (req, res) => {
    if (req.method === "OPTIONS") {
      res.writeHead(204, CORS_HEADERS);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", "http://127.0.0.1");
    if (url.pathname !== "/" && url.pathname !== "/get-login-ticket") {
      sendJson(res, 404, { code: "NOT_FOUND" });
      return;
    }
    if (req.method !== "POST") {
      sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (!service) {
      sendJson(res, 503, { code: "TICKET_SERVICE_NOT_CONFIGURED" });
      return;
    }

    try {
      const body = await readJsonBody(req);
      const result = await service.issue(body);
      sendJson(res, 200, result);
    } catch (error) {
      if (error instanceof PublicTicketError) {
        const statusCode = error.code === "WECHAT_CODE_INVALID" || error.code === "REQUEST_INVALID" || error.code === "REQUEST_TOO_LARGE" ? 400 : 503;
        sendJson(res, statusCode, { code: error.code });
        return;
      }
      sendJson(res, 503, { code: "TICKET_SERVICE_UNAVAILABLE" });
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
