const http = require("node:http");
const https = require("node:https");
const { URL, URLSearchParams } = require("node:url");
const { createProductSessionService, PublicLoginError, verifyAccessToken } = require("./product-session-service.cjs");
const { createProductDataService } = require("./product-data-service.cjs");
const { createDeepseekMealService, PublicMealAnalysisError } = require("./deepseek-meal-service.cjs");
const { createMealDataService, PublicMealDataError } = require("./meal-data-service.cjs");
const { createInsightDataService } = require("./insight-data-service.cjs");
const { createDeepseekCoachService } = require("./deepseek-coach-service.cjs");
const { createCoachDataService, PublicCoachDataError } = require("./coach-data-service.cjs");
const { createFeedbackDataService, PublicFeedbackError } = require("./feedback-data-service.cjs");
const { createVitaVisionService, PublicVisionError } = require("./vita-vision-service.cjs");
const { createVisionDataService, PublicVisionDataError } = require("./vision-data-service.cjs");

const MAX_BODY_BYTES = 4096;
const MAX_VISION_BODY_BYTES = 4_300_000;
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentType = typeof req.headers["content-type"] === "string" ? req.headers["content-type"] : "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      reject(new PublicLoginError("REQUEST_INVALID", "请求无效"));
      return;
    }
    let size = 0;
    let raw = "";

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
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

function selectDeepseekModel(value) {
  const model = typeof value === "string" ? value.trim() : "";
  if (!model || model === "deepseek-chat" || model === "deepseek-reasoner") return "deepseek-v4-flash";
  return model;
}

function createRuntimeService(env = process.env, dependencies = {}) {
  const config = readRuntimeConfig(env);
  const cloudbase = dependencies.cloudbaseSdk ?? require("@cloudbase/js-sdk");
  const app = cloudbase.init({
    env: config.cloudbaseEnvId,
    accessKey: config.cloudbaseApiKey,
    auth: { detectSessionInUrl: false },
  });
  const db = typeof app.rdb === "function" ? app.rdb() : app.rdb;
  if (!db || typeof db.from !== "function") throw new Error("Relational database client is unavailable");
  const deepseekModel = selectDeepseekModel(env.DEEPSEEK_MODEL);

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
  const data = createProductDataService({ db });
  const meals = createMealDataService({
    db,
    model: deepseekModel,
    analyze: typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
      ? createDeepseekMealService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
      : null,
  });
  const insights = createInsightDataService({
    listMealsRange: meals.listMealsRange,
    getNutritionPlan: data.getNutritionPlan,
  });
  let vision = null;
  if (typeof env.VITA_API_KEY === "string" && env.VITA_API_KEY) {
    const cloudbaseNode = dependencies.cloudbaseNodeSdk ?? require("@cloudbase/node-sdk");
    const admin = cloudbaseNode.init({ env: config.cloudbaseEnvId });
    vision = createVisionDataService({
      db,
      model: env.VITA_MODEL,
      analyze: createVitaVisionService({ apiKey: env.VITA_API_KEY, model: env.VITA_MODEL }),
      uploadImage: async ({ cloudPath, content }) => {
        const uploaded = await admin.uploadFile({ cloudPath, fileContent: content });
        const fileID = uploaded?.fileID;
        if (!fileID) throw new Error("Vision upload failed");
        const temporary = await admin.getTempFileURL({ fileList: [fileID] });
        const imageUrl = temporary?.fileList?.[0]?.tempFileURL;
        if (!imageUrl) throw new Error("Vision temporary URL failed");
        return { cloudPath: fileID, imageUrl };
      },
    });
  }
  return {
    issue: session.issue,
    verifySession: (token) => verifyAccessToken(token, config.sessionSecret),
    data,
    meals,
    insights,
    coach: createCoachDataService({
      db,
      getDailySummary: insights.getDailySummary,
      getWeeklyReview: insights.getWeeklyReview,
      getAccount: data.getAccount,
      model: deepseekModel,
      answer: typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
        ? createDeepseekCoachService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
        : null,
    }),
    feedback: createFeedbackDataService({ db }),
    vision,
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
  return ({
    "/profile": "saveProfile",
    "/body-profile": "saveBodyProfile",
    "/goal": "saveGoal",
    "/onboarding": "saveOnboarding",
    "/account": "getAccount",
    "/settings": "saveSettings",
    "/nutrition-plan": "nutritionPlan",
  })[path] ?? null;
}

function getMealRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/meal-analysis") return { operation: "createAnalysis" };
  if (path === "/meals") return { operation: "meals" };
  const match = path.match(/^\/meals\/([0-9a-f-]{36})$/i);
  return match ? { operation: "meal", mealId: match[1] } : null;
}

function getInsightRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  return ({
    "/meal-summary": "getDailySummary",
    "/weekly-review": "getWeeklyReview",
    "/achievements": "getAchievements",
  })[path] ?? null;
}

function getCoachRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/coach/messages") return "getMessages";
  if (path === "/coach/brief") return "getBrief";
  if (path === "/coach-answer") return "sendMessage";
  return null;
}

function isFeedbackRoute(pathname) {
  return pathname.replace(/^\/get-login-ticket/, "") === "/feedback";
}

function isVisionRoute(pathname) {
  return pathname.replace(/^\/get-login-ticket/, "") === "/vision-analysis";
}

function sendMealError(res, error) {
  if (error instanceof PublicMealDataError || error instanceof PublicMealAnalysisError) {
    const statusCode = error.code === "MEAL_DATA_INVALID" ? 400 : 503;
    sendJson(res, statusCode, { code: error.code });
    return;
  }
  sendJson(res, 503, { code: "MEAL_SERVICE_UNAVAILABLE" });
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
    const mealRoute = getMealRoute(url.pathname);
    const insightOperation = getInsightRoute(url.pathname);
    const coachOperation = getCoachRoute(url.pathname);
    const feedbackRoute = isFeedbackRoute(url.pathname);
    const visionRoute = isVisionRoute(url.pathname);
    if (url.pathname !== "/" && url.pathname !== "/get-login-ticket" && !dataOperation && !mealRoute && !insightOperation && !coachOperation && !feedbackRoute && !visionRoute) {
      sendJson(res, 404, { code: "NOT_FOUND" });
      return;
    }
    if (mealRoute) {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.meals) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try {
        if (mealRoute.operation === "meals" && req.method === "GET") {
          const date = url.searchParams.get("date");
          const from = url.searchParams.get("from");
          const to = url.searchParams.get("to");
          if (date) return sendJson(res, 200, await service.meals.listMeals(session.sub, date));
          if (from && to) return sendJson(res, 200, await service.meals.listMealsRange(session.sub, from, to));
          return sendJson(res, 400, { code: "MEAL_DATA_INVALID" });
        }
        if (mealRoute.operation === "meal" && req.method === "GET") {
          return sendJson(res, 200, await service.meals.getMeal(session.sub, mealRoute.mealId));
        }
        if (mealRoute.operation === "createAnalysis" && req.method === "POST") {
          return sendJson(res, 200, await service.meals.createAnalysis(session.sub, await readJsonBody(req)));
        }
        if (mealRoute.operation === "meals" && req.method === "POST") {
          return sendJson(res, 200, await service.meals.createMeal(session.sub, await readJsonBody(req)));
        }
        if (mealRoute.operation === "meal" && req.method === "PATCH") {
          return sendJson(res, 200, await service.meals.updateMeal(session.sub, mealRoute.mealId, await readJsonBody(req)));
        }
        if (mealRoute.operation === "meal" && req.method === "DELETE") {
          return sendJson(res, 200, { deleted: await service.meals.deleteMeal(session.sub, mealRoute.mealId) });
        }
        return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      } catch (error) {
        sendMealError(res, error);
        return;
      }
    }
    if (insightOperation && req.method === "GET") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.insights?.[insightOperation]) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      const date = url.searchParams.get("date");
      if (!date) return sendJson(res, 400, { code: "INSIGHT_DATA_INVALID" });
      try {
        return sendJson(res, 200, await service.insights[insightOperation](session.sub, date));
      } catch {
        return sendJson(res, 400, { code: "INSIGHT_DATA_INVALID" });
      }
    }
    if (coachOperation) {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.coach?.[coachOperation]) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try {
        if (coachOperation === "getMessages" && req.method === "GET") {
          return sendJson(res, 200, await service.coach.getMessages(session.sub));
        }
        if (coachOperation === "getBrief" && req.method === "GET") {
          const date = url.searchParams.get("date");
          if (!date) return sendJson(res, 400, { code: "COACH_INPUT_INVALID" });
          return sendJson(res, 200, await service.coach.getBrief(session.sub, date));
        }
        if (coachOperation === "sendMessage" && req.method === "POST") {
          return sendJson(res, 200, await service.coach.sendMessage(session.sub, await readJsonBody(req)));
        }
        return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      } catch (error) {
        if (error instanceof PublicCoachDataError) return sendJson(res, 400, { code: error.code });
        return sendJson(res, 503, { code: "COACH_SERVICE_UNAVAILABLE" });
      }
    }
    if (feedbackRoute) {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.feedback?.submitFeedback) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        return sendJson(res, 200, await service.feedback.submitFeedback(session.sub, await readJsonBody(req)));
      } catch (error) {
        if (error instanceof PublicFeedbackError) return sendJson(res, 400, { code: error.code });
        return sendJson(res, 503, { code: "FEEDBACK_SAVE_FAILED" });
      }
    }
    if (visionRoute) {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      if (!service.vision?.analyzeImage) return sendJson(res, 503, { code: "VISION_SERVICE_NOT_CONFIGURED" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        return sendJson(res, 200, await service.vision.analyzeImage(session.sub, await readJsonBody(req, MAX_VISION_BODY_BYTES)));
      } catch (error) {
        if (error instanceof PublicVisionDataError || error instanceof PublicVisionError) {
          const statusCode = error.code === "VISION_IMAGE_INVALID" || error.code === "VISION_RESULT_INVALID" ? 400 : 503;
          return sendJson(res, statusCode, { code: error.code });
        }
        return sendJson(res, 503, { code: "VISION_SERVICE_UNAVAILABLE" });
      }
    }
    if (dataOperation === "getAccount" && req.method === "GET") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.data?.getAccount) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.getAccount(session.sub)); } catch { return sendJson(res, 503, { code: "ACCOUNT_READ_FAILED" }); }
    }
    if (dataOperation === "nutritionPlan" && req.method === "GET") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.data?.getNutritionPlan) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.getNutritionPlan(session.sub)); } catch { return sendJson(res, 503, { code: "NUTRITION_PLAN_READ_FAILED" }); }
    }
    if (dataOperation === "saveSettings" && req.method === "PATCH") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.data?.saveSettings) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.saveSettings(session.sub, await readJsonBody(req))); } catch { return sendJson(res, 400, { code: "SETTINGS_SAVE_FAILED" }); }
    }
    if (dataOperation === "nutritionPlan" && req.method === "PATCH") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.data?.saveNutritionPlan) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.saveNutritionPlan(session.sub, await readJsonBody(req))); } catch { return sendJson(res, 400, { code: "NUTRITION_PLAN_SAVE_FAILED" }); }
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
  selectDeepseekModel,
  requestWechatSession,
};
