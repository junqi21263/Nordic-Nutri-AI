const http = require("node:http");
const https = require("node:https");
const crypto = require("node:crypto");
const { URL, URLSearchParams } = require("node:url");
const { createProductSessionService, PublicLoginError, verifyAccessToken } = require("./product-session-service.cjs");
const { createProductDataService } = require("./product-data-service.cjs");
const { createDeepseekMealService, PublicMealAnalysisError } = require("./deepseek-meal-service.cjs");
const { createDeepseekEvaluationService } = require("./deepseek-evaluation-service.cjs");
const { createDeepseekNutritionPlanService } = require("./deepseek-nutrition-plan-service.cjs");
const { createMealDataService, PublicMealDataError } = require("./meal-data-service.cjs");
const {
  createDeepseekMealInsightService,
} = require("./meal-food-link-service.cjs");
const { createInsightDataService } = require("./insight-data-service.cjs");
const { createDailyInsightService } = require("./daily-insight-service.cjs");
const { createDeepseekWeeklyReviewService } = require("./deepseek-weekly-review-service.cjs");
const { createFoodInsightService } = require("./food-insight-service.cjs");
const { createNutritionInsightWorkerClient } = require("./nutrition-insight-worker-client.cjs");
const { createDeepseekCoachService, createDeepseekCoachStreamService } = require("./deepseek-coach-service.cjs");
const { createDailyTipService } = require("./daily-tip-service.cjs");
const { createCoachDataService, PublicCoachDataError } = require("./coach-data-service.cjs");
const { createFeedbackDataService, PublicFeedbackError } = require("./feedback-data-service.cjs");
const { createVitaVisionService, PublicVisionError } = require("./vita-vision-service.cjs");
const { createQwenVisionService, PublicQwenVisionError } = require("./qwen-vision-service.cjs");
const { createVisionDataService, PublicVisionDataError } = require("./vision-data-service.cjs");
const { createFoodCatalogService, PublicFoodCatalogError } = require("./food-catalog-service.cjs");
const { createFoodQueryTranslator } = require("./food-query-translator.cjs");
const { createNutritionBackfillService } = require("./nutrition-backfill-service.cjs");
const { createProfileAvatarService, PublicProfileAvatarError } = require("./profile-avatar-service.cjs");
const { createAccountDeletionService, PublicAccountDeletionError } = require("./account-deletion-service.cjs");
const { createOperationGuard, PublicOperationError } = require("./operation-guard.cjs");
const { createAdminConsoleAuthService, PublicAdminAuthError } = require("./admin-console-auth-service.cjs");
const { createFoodRepository, FoodRepositoryError } = require("./food-repository.cjs");
const { createUsdaService, UsdaServiceError } = require("./usda-service.cjs");
const { createOpenFoodFactsService, OpenFoodFactsError } = require("./open-food-facts-service.cjs");
const { normalizeFoodRecord } = require("./food-normalization-service.cjs");
const { createFoodImageService, FoodImageError } = require("./food-image-service.cjs");
const { createFoodBarcodeService, FoodBarcodeError } = require("./food-barcode-service.cjs");
const { createFoodAdminService, FoodAdminError } = require("./food-admin-service.cjs");
const { createAdminConsoleService, AdminConsoleError } = require("./admin-console-service.cjs");
const { createHunyuanImageService, HunyuanImageError } = require("./hunyuan-image-service.cjs");
const { createHunyuanWorkerClient } = require("./hunyuan-worker-client.cjs");
const { createFoodImageJobService, FoodImageJobError } = require("./food-image-job-service.cjs");
const { createFoodImageBatchService, FoodImageBatchError } = require("./food-image-batch-service.cjs");
const { createFoodImagePatrolService, FoodImagePatrolError } = require("./food-image-patrol-service.cjs");
const { getFoodDisplayName } = require("./food-display-name.cjs");
const { formulaNutritionPlanFallback } = require("./nutrition-plan-formula.cjs");

// Random 5–6 hanzi Chinese nickname generator for default profile seeding.
// Mirrors the frontend generator in features/profile/nickname-generator.ts.
const NICKNAME_SCENES = ["林间", "山野", "森林", "溪畔", "云端", "晨光", "星野", "麦田", "果园", "茶园", "山间", "林荫", "花间", "竹林", "松林", "檐下", "湖畔", "原野", "谷地", "晨雾"];
const NICKNAME_PLANTS = ["青柠", "薄荷", "柚子", "蓝莓", "樱桃", "柠檬", "茉莉", "桂花", "茴香", "麦穗", "稻穗", "芦笋", "秋葵", "山茶", "银杏", "枫叶", "苔藓", "藤蔓", "白桦", "桑葚"];
const NICKNAME_ROLES = ["漫游者", "轻食客", "补给站", "小行星", "探索家", "收集者", "守望者", "漫步者", "记录员", "品鉴官", "慢行者", "寻味人", "拾光者", "阅光人", "采风客", "慢食家"];
const NICKNAME_ACTIONS = ["慢慢走", "慢慢吃", "轻轻走", "慢慢品", "静静听", "慢慢来", "慢慢长", "慢慢见", "慢慢记"];
const NICKNAME_ADVERBS = ["慢慢地", "静静地", "轻轻地", "慢慢儿"];
const NICKNAME_VERBS = ["变更好", "走很远", "吃好饭", "见晨光", "等花开", "晒太阳"];
const NICKNAME_PATTERNS = [
  () => pick(NICKNAME_SCENES) + pick(NICKNAME_ROLES),
  () => pick(NICKNAME_PLANTS) + pick(NICKNAME_ROLES),
  () => pick(NICKNAME_SCENES) + pick(NICKNAME_ACTIONS),
  () => pick(NICKNAME_PLANTS) + pick(NICKNAME_ACTIONS),
  () => pick(NICKNAME_ADVERBS) + pick(NICKNAME_VERBS),
];
function pick(list) { return list[Math.floor(Math.random() * list.length)]; }
function pickNickname() {
  for (let i = 0; i < 32; i++) {
    const candidate = pick(NICKNAME_PATTERNS)();
    if (candidate.length >= 5 && candidate.length <= 6) return candidate;
  }
  return "林间慢慢走";
}

const MAX_BODY_BYTES = 4096;
const MAX_VISION_BODY_BYTES = 30 * 1024 * 1024;
// CloudBase HTTP access already injects Access-Control-Allow-Origin for the
// request origin. Setting it here as "*" produces duplicate values and browsers
// reject the response ("The 'Access-Control-Allow-Origin' header contains
// multiple values '... , *', but only one is allowed").
const CORS_HEADERS = {
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

function mapRepositoryFoodForCatalog(food) {
  const nutrition = food?.nutritionPer100g ?? {};
  return {
    id: food.id,
    source: food.source,
    sourceFoodId: food.sourceId,
    description: getFoodDisplayName(food),
    brandName: food.brandName ?? null,
    dataType: food.foodForm ?? null,
    category: food.category?.code ?? null,
    servingSize: food.servingSize ?? null,
    servingUnit: food.servingUnit ?? null,
    caloriesKcalPer100g: nutrition.calories ?? null,
    proteinGPer100g: nutrition.protein ?? null,
    carbsGPer100g: nutrition.carbs ?? null,
    fatGPer100g: nutrition.fat ?? null,
    foodGroupId: food.foodGroupId ?? null,
    isPrimaryVariant: food.isPrimaryVariant !== false,
    variantLabelZh: food.variantLabelZh ?? null,
    imageUrl: food.imageUrl ?? null,
    image: food.image ?? null,
    sourceUrl: null,
  };
}

function mapRepositoryCatalogResult(result) {
  return {
    items: (result?.items ?? []).map(mapRepositoryFoodForCatalog),
    page: result?.pagination?.page ?? 1,
    pagination: result?.pagination ?? { page: 1, pageSize: 20, total: 0, hasMore: false },
    source: "standard_food_v1",
  };
}

function shuffleCatalogItems(items) {
  const shuffled = [...(items ?? [])];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
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

function readRawJsonBody(req, maxBytes = MAX_BODY_BYTES) {
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
        resolve({ raw, body: JSON.parse(raw) });
      } catch {
        reject(new PublicLoginError("REQUEST_INVALID", "请求无效"));
      }
    });
    req.on("error", reject);
  });
}

function signFoodImageDispatch(secret, { timestamp, method = "POST", path, body = "" } = {}) {
  const canonical = `${timestamp}\n${String(method).toUpperCase()}\n${path}\n${body}`;
  return crypto.createHmac("sha256", String(secret || "")).update(canonical).digest("hex");
}

function verifyFoodImageDispatchSignature(secret, req, { path, body, now = Date.now() } = {}) {
  if (!secret || !path) return false;
  const timestamp = String(req.headers["x-food-image-dispatch-timestamp"] || "");
  const signature = String(req.headers["x-food-image-dispatch-signature"] || "");
  const numericTimestamp = Number(timestamp);
  if (!Number.isInteger(numericTimestamp) || Math.abs(Math.floor(now / 1000) - numericTimestamp) > 300) return false;
  const expected = signFoodImageDispatch(secret, { timestamp, method: req.method, path, body });
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
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

function createHunyuanGenerationService({ env, aiClient, createWorkerClient = createHunyuanWorkerClient } = {}) {
  const enabled = String(env?.FOOD_IMAGE_GENERATION_ENABLED ?? "true").toLowerCase() !== "false";
  if (!enabled) return null;
  const modelName = env?.HY_IMAGE_MODEL;
  const size = env?.HY_IMAGE_SIZE || `${env?.HY_IMAGE_WIDTH || 1280}x${env?.HY_IMAGE_HEIGHT || 720}`;
  const maxRetries = Number(env?.HY_IMAGE_MAX_RETRIES) || 3;
  const workerEndpoint = typeof env?.HY_IMAGE_WORKER_ENDPOINT === "string" ? env.HY_IMAGE_WORKER_ENDPOINT.trim() : "";
  if (workerEndpoint) {
    const worker = createWorkerClient({
      endpoint: workerEndpoint,
      sharedSecret: env?.AI_WORKER_SHARED_SECRET,
      timeoutMs: Number(env?.HY_IMAGE_REQUEST_TIMEOUT_MS) || 300000,
    });
    return createHunyuanImageService({
      modelName,
      size,
      maxRetries,
      generateImageImpl: worker.generateImage,
    });
  }
  if (!aiClient || typeof aiClient.createImageModel !== "function") {
    throw new Error("CloudBase ai.createImageModel unavailable — check @cloudbase/ai >= 2.30.0");
  }
  return createHunyuanImageService({ ai: aiClient, modelName, size, maxRetries });
}

function downloadImageBuffer(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      timeout: 7000,
      headers: { "User-Agent": "NordicNutriAI/1.0 (food-catalog; support@nordicnutri.app)" },
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Food image download failed (${response.statusCode ?? 0})`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    request.on("timeout", () => request.destroy(new Error("Food image download timed out")));
    request.on("error", reject);
  });
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
  const evaluateMeal = typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
    ? createDeepseekEvaluationService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
    : null;
  const calculateNutritionPlanWithAi = typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
    ? createDeepseekNutritionPlanService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
    : null;

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

      // Seed a default profile (robot avatar + generated nickname) when missing, so
      // home/profile screens show a friendly identity instead of the "微信用户" placeholder.
      // Also backfills existing users who logged in before defaults were introduced.
      const robotIndex = 1 + Math.floor(Math.random() * 4);
      const defaultAvatarPath = `default:robot-${robotIndex}`;
      const defaultNickname = pickNickname();
      try {
        const profileRow = await db
          .from("profiles")
          .select("id,nickname,avatar_path,onboarding_completed_at")
          .eq("id", userId)
          .maybeSingle();
        if (profileRow.error) throw new Error("Product profile lookup failed");

        if (!profileRow.data?.id) {
          await db
            .from("profiles")
            .insert({ id: userId, nickname: defaultNickname, avatar_path: defaultAvatarPath })
            .select("id")
            .maybeSingle();
        } else {
          const needsNickname =
            !profileRow.data.nickname ||
            profileRow.data.nickname === "微信用户" ||
            !String(profileRow.data.nickname).trim();
          const needsAvatar = !profileRow.data.avatar_path;
          if (needsNickname || needsAvatar) {
            const patch = {};
            if (needsNickname) patch.nickname = defaultNickname;
            if (needsAvatar) patch.avatar_path = defaultAvatarPath;
            await db.from("profiles").update(patch).eq("id", userId);
          }
        }
      } catch {
        // Non-fatal: profile can be completed later via onboarding/edit.
      }

      const profile = await db.from("profiles").select("onboarding_completed_at").eq("id", userId).maybeSingle();
      if (profile.error) throw new Error("Product profile lookup failed");
      return { userId, onboardingRequired: !profile.data?.onboarding_completed_at };
    },
  });
  const cloudbaseNode = dependencies.cloudbaseNodeSdk ?? require("@cloudbase/node-sdk");
  // HTTP cloud functions do not always inject TENCENTCLOUD_* temp keys the way event
  // functions do. Pass the same server API key used by the relational DB client so
  // storage uploadFile / getTempFileURL authenticate reliably.
  const admin = cloudbaseNode.init({
    env: config.cloudbaseEnvId,
    accessKey: config.cloudbaseApiKey,
  });
  const workerEndpoint = typeof env.HY_IMAGE_WORKER_ENDPOINT === "string" ? env.HY_IMAGE_WORKER_ENDPOINT.trim() : "";
  // Hunyuan image must use SCF runtime credentials (TENCENTCLOUD_SECRETID/KEY),
  // not CLOUDBASE_APIKEY. node-sdk init() prefers CLOUDBASE_APIKEY from process.env
  // when present — and this function requires that key for RDB — so AI init would
  // silently auth as API-key and fail generateImage quickly (HY_IMAGE_GENERATE_FAILED).
  // Temporarily hide the API key during AI init so each request refreshes ambient
  // TENCENTCLOUD_* via prepareCredentials(). Explicit permanent secrets still win.
  const explicitSecretId = String(env.TENCENTCLOUD_SECRET_ID || "").trim();
  const explicitSecretKey = String(env.TENCENTCLOUD_SECRET_KEY || "").trim();
  const ambientSecretId = String(env.TENCENTCLOUD_SECRETID || "").trim();
  const ambientSecretKey = String(env.TENCENTCLOUD_SECRETKEY || "").trim();
  const ambientSessionToken = String(env.TENCENTCLOUD_SESSIONTOKEN || "").trim();
  const aiTimeoutMs = Number(env.HY_IMAGE_REQUEST_TIMEOUT_MS) || 300000;
  const aiRuntimeInit = {
    env: config.cloudbaseEnvId,
    timeout: aiTimeoutMs,
  };
  let aiAuthMode = workerEndpoint ? "remote-worker" : "scf-ambient";
  if (!workerEndpoint && explicitSecretId && explicitSecretKey) {
    aiRuntimeInit.secretId = explicitSecretId;
    aiRuntimeInit.secretKey = explicitSecretKey;
    aiAuthMode = "explicit-secret";
  }
  const savedCloudbaseApiKey = process.env.CLOUDBASE_APIKEY;
  // Storage must always use the function's ambient runtime identity. In remote-worker
  // mode there is deliberately no local AI client, but generated files still belong in
  // the primary environment's Storage. The API-key client remains only as a fallback.
  let storageRuntime = null;
  try {
    delete process.env.CLOUDBASE_APIKEY;
    storageRuntime = cloudbaseNode.init(aiRuntimeInit);
  } catch (error) {
    console.error("[storage] ambient runtime init failed:", error?.message || error);
  } finally {
    if (savedCloudbaseApiKey !== undefined) process.env.CLOUDBASE_APIKEY = savedCloudbaseApiKey;
  }

  let aiRuntime = null;
  let aiClient = null;
  if (!workerEndpoint) {
    try {
      aiRuntime = aiAuthMode === "scf-ambient" ? storageRuntime : cloudbaseNode.init(aiRuntimeInit);
      aiClient = typeof aiRuntime.ai === "function" ? aiRuntime.ai() : aiRuntime.ai;
    } finally {
      if (savedCloudbaseApiKey !== undefined) process.env.CLOUDBASE_APIKEY = savedCloudbaseApiKey;
    }
  }
  if (aiAuthMode === "scf-ambient" && (!ambientSecretId || !ambientSecretKey)) {
    console.error("[hunyuan] TENCENTCLOUD_SECRETID/KEY missing in runtime — image generation will fail");
    aiAuthMode = "missing-credentials";
  }
  console.log(`[hunyuan] ai auth mode=${aiAuthMode} timeoutMs=${aiTimeoutMs} hasAmbientSecret=${Boolean(ambientSecretId && ambientSecretKey)}`);
  const getTemporaryUrl = async (fileId) => {
    // Inline / sentinel avatar refs are already displayable — never resolve via Storage.
    if (typeof fileId === "string") {
      if (fileId.startsWith("default:")) return fileId;
      if (fileId.startsWith("data:")) return fileId;
      if (/^https?:\/\//i.test(fileId)) return fileId;
    }
    try {
      const result = await admin.getTempFileURL({ fileList: [fileId] });
      return result?.fileList?.[0]?.tempFileURL ?? null;
    } catch (error) {
      console.error("[storage] getTempFileURL failed:", error?.message || error);
      return null;
    }
  };
  const data = createProductDataService({ db, resolveAvatarUrl: getTemporaryUrl });
  const avatar = createProfileAvatarService({
    data,
    uploadImage: async ({ cloudPath, content, contentType }) => {
      // Legacy CloudBase Storage JWT auth is broken in this HTTP function runtime.
      // Skip cloud upload and let the avatar service persist an inline data URL instead
      // so we never overwrite default:robot-N with an unresolvable storage ref.
      void cloudPath;
      void content;
      void contentType;
      throw new Error("Cloud storage unavailable; use inline avatar fallback");
    },
    createTemporaryUrl: getTemporaryUrl,
  });
  const configuredTextWorkerEndpoint = typeof env.AI_TEXT_WORKER_ENDPOINT === "string" ? env.AI_TEXT_WORKER_ENDPOINT.trim() : "";
  const textWorkerEndpoint = configuredTextWorkerEndpoint || (workerEndpoint.endsWith("/generate")
    ? `${workerEndpoint.slice(0, -"/generate".length)}/nutrition-insight`
    : "");
  const textWorkerSecret = (typeof env.AI_TEXT_WORKER_SHARED_SECRET === "string" ? env.AI_TEXT_WORKER_SHARED_SECRET.trim() : "")
    || (typeof env.AI_WORKER_SHARED_SECRET === "string" ? env.AI_WORKER_SHARED_SECRET.trim() : "");
  const devTextModel = typeof env.HY_TEXT_MODEL === "string" && env.HY_TEXT_MODEL.trim()
    ? env.HY_TEXT_MODEL.trim()
    : "hunyuan-2.0-instruct-20251111";
  const nutritionInsightWorkerClientFactory = dependencies.nutritionInsightWorkerClientFactory ?? createNutritionInsightWorkerClient;
  let nutritionContentWorker = null;
  if (textWorkerEndpoint && textWorkerSecret) {
    try {
      nutritionContentWorker = nutritionInsightWorkerClientFactory({
        endpoint: textWorkerEndpoint,
        sharedSecret: textWorkerSecret,
        timeoutMs: Number(env.AI_TEXT_WORKER_TIMEOUT_MS) || 30000,
      });
    } catch (error) {
      console.error("[nutrition-content] dev worker configuration failed:", error?.code || error?.message || error);
    }
  }
  const deepseekEnabled = typeof env.DEEPSEEK_API_KEY === "string" && Boolean(env.DEEPSEEK_API_KEY);
  const generateMealInsight = deepseekEnabled
    ? createDeepseekMealInsightService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
    : null;
  const meals = createMealDataService({
    db,
    model: deepseekModel,
    analyze: deepseekEnabled
      ? createDeepseekMealService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
      : null,
    generateMealInsight,
    resolveImageUrl: async (fileID) => {
      const temporary = await admin.getTempFileURL({ fileList: [fileID] });
      return temporary?.fileList?.[0]?.tempFileURL || null;
    },
  });
  const dailyInsightFactory = dependencies.dailyInsightFactory ?? createDailyInsightService;
  const dailyInsight = dailyInsightFactory({
    apiKey: env.DEEPSEEK_API_KEY,
    model: deepseekModel,
    source: "deepseek",
  });
  const weeklyReview = createDeepseekWeeklyReviewService({
    apiKey: env.DEEPSEEK_API_KEY,
    model: env.DEEPSEEK_WEEKLY_MODEL || "deepseek-v4-pro",
  });
  const insights = createInsightDataService({
    db,
    listMealsRange: meals.listMealsRange,
    getNutritionPlan: data.getNutritionPlan,
    generateDailyInsight: dailyInsight,
    generateWeeklyReview: weeklyReview,
  });
  const foodCatalog = typeof env.USDA_FDC_API_KEY === "string" && env.USDA_FDC_API_KEY.trim()
    ? createFoodCatalogService({
      db,
      apiKey: env.USDA_FDC_API_KEY,
      translateQuery: createFoodQueryTranslator({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel }),
      mirrorImage: async (imageUrl, foodKey) => {
        const content = await downloadImageBuffer(imageUrl);
        if (!content.length || content.length > 2 * 1024 * 1024) throw new Error("Food image mirror failed");
        const cloudPath = `food-catalog/${String(foodKey).replace(/[^a-z0-9:_-]/gi, "-")}.jpg`;
        const uploaded = await admin.uploadFile({ cloudPath, fileContent: content });
        if (!uploaded?.fileID) throw new Error("Food image upload failed");
        const temporary = await getTemporaryUrl(uploaded.fileID);
        if (!temporary) throw new Error("Food image temporary URL failed");
        return temporary;
      },
    })
    : null;
  const backfillNutrition = foodCatalog ? createNutritionBackfillService({ foodCatalog }) : null;

  // Unified food data model services (food_catalog_v2). The repository wraps the
  // same RDB client; USDA/OFF/image services are env-gated. These coexist with
  // the legacy foodCatalog so existing /foods routes keep working while the new
  // /foods/categories, /foods/tags, /foods/suggestions, /foods/barcode and
  // /api/admin/foods routes serve the richer model.
  const foodRepository = createFoodRepository({
    db,
    imageCdnBaseUrl: env.FOOD_IMAGE_CDN_BASE_URL,
  });
  // Admin HTTP routes require role=admin_console from password login; drop the
  // separate is_admin DB gate so operators no longer need a promoted WeChat user.
  foodRepository.isAdmin = async () => true;
  const foodInsight = createFoodInsightService({
    requestCompletion: nutritionContentWorker ? (context) => nutritionContentWorker.generateInsight(context) : null,
    model: devTextModel,
    source: "hunyuan-exp",
    db,
  });
  const usdaService = typeof env.USDA_FDC_API_KEY === "string" && env.USDA_FDC_API_KEY.trim()
    ? createUsdaService({ apiKey: env.USDA_FDC_API_KEY, baseUrl: env.USDA_API_BASE_URL || "https://api.nal.usda.gov/fdc/v1" })
    : null;
  const openFoodFactsService = createOpenFoodFactsService({
    baseUrl: env.OPEN_FOOD_FACTS_BASE_URL || "https://world.openfoodfacts.org",
    userAgent: env.OPEN_FOOD_FACTS_USER_AGENT || "NordicNutriAI/1.0",
  });
  const foodImageService = createFoodImageService({
    allowedHosts: (env.FOOD_IMAGE_ALLOWED_HOSTS || "images.openfoodfacts.org,world.openfoodfacts.org,static.openfoodfacts.org,images-us.openfoodfacts.org").split(",").map((h) => h.trim()).filter(Boolean),
    maxBytes: Number(env.FOOD_IMAGE_MAX_BYTES) || 10 * 1024 * 1024,
    storageBucket: env.FOOD_IMAGE_STORAGE_BUCKET || "food-images",
    storagePrefix: env.FOOD_IMAGE_STORAGE_PREFIX || "food-library",
    uploader: async ({ cloudPath, fileContent, contentType }) => {
      // Prefer primary-environment runtime identity. Remote-worker mode has no local
      // AI client, but Storage still needs this client rather than API-key-only auth.
      const clients = [storageRuntime, admin].filter(Boolean);
      let lastError = null;
      for (const client of clients) {
        try {
          const uploaded = await client.uploadFile({ cloudPath, fileContent });
          if (!uploaded?.fileID) throw new Error("Food image upload failed");
          // Storage path is the canonical address. Do not persist a temporary
          // URL or expose a fileID as a display URL.
          return { fileID: uploaded.fileID };
        } catch (error) {
          lastError = error;
        }
      }
      void contentType;
      throw lastError || new Error("Food image upload failed");
    },
    deleter: async ({ cloudPaths }) => {
      const paths = Array.isArray(cloudPaths) ? cloudPaths.filter(Boolean) : [];
      if (!paths.length) return { deleted: 0 };
      const clients = [storageRuntime, admin].filter(Boolean);
      const envId = String(env.TCB_ENV || env.SCF_NAMESPACE || "").trim();
      let deleted = 0;
      let lastError = null;
      for (const cloudPath of paths) {
        const candidates = cloudPath.startsWith("cloud://")
          ? [cloudPath]
          : [cloudPath, envId ? `cloud://${envId}/${cloudPath}` : null].filter(Boolean);
        let ok = false;
        for (const client of clients) {
          if (typeof client?.deleteFile !== "function") continue;
          for (const fileId of candidates) {
            try {
              await client.deleteFile({ fileList: [fileId] });
              ok = true;
              break;
            } catch (error) {
              lastError = error;
            }
          }
          if (ok) break;
        }
        if (ok) deleted += 1;
      }
      if (!deleted && lastError) {
        console.warn("[food-image] storage delete incomplete:", lastError?.message || lastError);
      }
      return { deleted, attempted: paths.length };
    },
  });
  const foodBarcodeService = createFoodBarcodeService({
    repository: foodRepository,
    openFoodFacts: openFoodFactsService,
    normalizer: { normalizeFoodRecord },
    imageService: foodImageService,
    imageSyncEnabled: true,
  });
  const foodAdminService = createFoodAdminService({
    repository: foodRepository,
    usdaService,
    normalizer: { normalizeFoodRecord },
    imageService: foodImageService,
  });
  // Password-gated admin console sessions already prove operator access; skip the
  // legacy app_users.is_admin flag so ops no longer depends on manually promoting a WeChat user.
  const allowAdminConsole = async () => true;
  const adminConsoleService = createAdminConsoleService({
    db,
    isAdmin: allowAdminConsole,
  });
  const adminConsoleAuth = createAdminConsoleAuthService({
    db,
    sessionSecret: config.sessionSecret,
    identityPepper: config.identityPepper,
    username: env.ADMIN_CONSOLE_USERNAME,
    password: env.ADMIN_CONSOLE_PASSWORD,
  });

  // Hunyuan food-image generation (小程序成长计划). Model ID comes from env —
  // never accept client-supplied model names. Disabled when FOOD_IMAGE_GENERATION_ENABLED=false.
  const hunyuanEnabled = String(env.FOOD_IMAGE_GENERATION_ENABLED ?? "true").toLowerCase() !== "false";
  let hunyuanImageService = null;
  let foodImageJobs = null;
  if (hunyuanEnabled) {
    try {
      hunyuanImageService = createHunyuanGenerationService({
        env,
        aiClient,
        createWorkerClient: dependencies.createHunyuanWorkerClient ?? createHunyuanWorkerClient,
      });
    } catch (error) {
      console.error("[hunyuan] init failed:", error?.message || error);
    }
  }
  foodImageJobs = createFoodImageJobService({
    db,
    repository: foodRepository,
    hunyuan: hunyuanImageService,
    imageService: foodImageService,
    config: {
      candidateCount: Number(env.HY_IMAGE_CANDIDATE_COUNT) || 1,
      concurrency: Number(env.HY_IMAGE_CONCURRENCY) || 2,
      dailyLimit: Number(env.HY_IMAGE_DAILY_LIMIT) || 500,
      maxAttempts: Number(env.HY_IMAGE_MAX_RETRIES) || 3,
      storagePrefix: env.FOOD_IMAGE_STORAGE_PREFIX || "food-library",
      imageCdnBaseUrl: env.FOOD_IMAGE_CDN_BASE_URL,
      generationEnabled: hunyuanEnabled && Boolean(hunyuanImageService),
    },
    triggerWorker: async ({ jobId }) => {
      // Fire-and-forget same-process worker (SCF may freeze after response —
      // also expose POST /api/admin/food-image-jobs/worker for timer triggers).
      setImmediate(() => {
        foodImageJobs.processQueue(null, { jobId }).catch((err) => {
          console.error("[food-image-jobs] async worker failed:", err?.code || err?.message || err);
        });
      });
    },
  });
  const foodImageBatches = createFoodImageBatchService({
    db,
    repository: foodRepository,
    jobs: foodImageJobs,
    resolveAdminExecutor: () => adminConsoleAuth.ensureActor(),
  });
  const foodImagePatrol = createFoodImagePatrolService({
    db,
    repository: foodRepository,
    batches: foodImageBatches,
    jobs: foodImageJobs,
    dailyCap: Math.min(Number(env.HY_IMAGE_DAILY_LIMIT) || 500, 500),
  });
  let vision = null;
  const qwenApiKey = typeof env.QWEN_API_KEY === "string" && env.QWEN_API_KEY.trim()
    ? env.QWEN_API_KEY
    : env.DASHSCOPE_API_KEY;
  if (typeof qwenApiKey === "string" && qwenApiKey.trim()) {
    vision = createVisionDataService({
      db,
      provider: "qwen",
      model: env.QWEN_VL_FLASH_MODEL || "qwen3-vl-flash",
      analyze: createQwenVisionService({
        apiKey: qwenApiKey,
        workspaceId: env.QWEN_WORKSPACE_ID || "llm-ekun6ter25w7d0ms",
        flashModel: env.QWEN_VL_FLASH_MODEL,
        plusModel: env.QWEN_VL_PLUS_MODEL,
      }),
      evaluateMeal,
      backfillNutrition,
      uploadImage: async ({ cloudPath, content, contentType }) => {
        const toDataUrl = () => {
          const mime = contentType || "image/jpeg";
          return { cloudPath: null, imageUrl: `data:${mime};base64,${content.toString("base64")}` };
        };
        try {
          const uploaded = await Promise.race([
            (async () => {
              const result = await admin.uploadFile({ cloudPath, fileContent: content });
              const fileID = result?.fileID;
              if (!fileID) throw new Error("Vision upload failed");
              const temporary = await admin.getTempFileURL({ fileList: [fileID] });
              const imageUrl = temporary?.fileList?.[0]?.tempFileURL;
              if (!imageUrl) throw new Error("Vision temporary URL failed");
              return { cloudPath: fileID, imageUrl };
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Vision upload timed out")), 2_000)),
          ]);
          return uploaded;
        } catch (uploadErr) {
          console.error("[vision] Storage upload failed, using data URL fallback:", uploadErr?.message || uploadErr);
          return toDataUrl();
        }
      },
    });
  } else if (typeof env.VITA_API_KEY === "string" && env.VITA_API_KEY) {
    vision = createVisionDataService({
      db,
      model: env.VITA_MODEL,
      analyze: createVitaVisionService({ apiKey: env.VITA_API_KEY, model: env.VITA_MODEL }),
      evaluateMeal,
      backfillNutrition,
      uploadImage: async ({ cloudPath, content, contentType }) => {
        const toDataUrl = () => {
          const mime = contentType || "image/jpeg";
          return { cloudPath: null, imageUrl: `data:${mime};base64,${content.toString("base64")}` };
        };
        try {
          const uploaded = await Promise.race([
            (async () => {
              const result = await admin.uploadFile({ cloudPath, fileContent: content });
              const fileID = result?.fileID;
              if (!fileID) throw new Error("Vision upload failed");
              const temporary = await admin.getTempFileURL({ fileList: [fileID] });
              const imageUrl = temporary?.fileList?.[0]?.tempFileURL;
              if (!imageUrl) throw new Error("Vision temporary URL failed");
              return { cloudPath: fileID, imageUrl };
            })(),
            new Promise((_, reject) => setTimeout(() => reject(new Error("Vision upload timed out")), 2_000)),
          ]);
          return uploaded;
        } catch (uploadErr) {
          console.error("[vision] Storage upload failed, using data URL fallback:", uploadErr?.message || uploadErr);
          return toDataUrl();
        }
      },
    });
  }
  const accountDeletion = createAccountDeletionService({
    db,
    operationGuard: typeof db.rpc === "function" ? createOperationGuard({ db }) : null,
    deleteFiles: async ({ cloudPaths }) => {
      const paths = Array.isArray(cloudPaths) ? cloudPaths.filter(Boolean) : [];
      if (!paths.length) return;
      const envId = String(env.TCB_ENV || env.SCF_NAMESPACE || "").trim();
      for (const cloudPath of paths) {
        const candidates = cloudPath.startsWith("cloud://")
          ? [cloudPath]
          : [cloudPath, envId ? `cloud://${envId}/${cloudPath}` : null].filter(Boolean);
        let deleted = false;
        for (const fileId of candidates) {
          try {
            await admin.deleteFile({ fileList: [fileId] });
            deleted = true;
            break;
          } catch (error) {
            console.warn("[account-cancellation] storage delete retry:", fileId, error?.message || error);
          }
        }
        if (!deleted) console.warn("[account-cancellation] storage object left in place:", cloudPath);
      }
    },
  });
  return {
    issue: session.issue,
    verifySession: (token) => verifyAccessToken(token, config.sessionSecret),
    data,
    meals,
    insights,
    coach: createCoachDataService({
      db,
      getDailySummary: (userId, date) => insights.getDailySummary(userId, date, { resolveImages: false }),
      getWeeklyReview: insights.getWeeklyReview,
      getAccount: data.getAccount,
      model: deepseekModel,
      answer: typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
        ? createDeepseekCoachService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
        : null,
      streamAnswer: typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
        ? createDeepseekCoachStreamService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
        : null,
      dailyTip: createDailyTipService({
        requestCompletion: nutritionContentWorker ? (input) => input.purpose === "coach_quick_prompt"
          ? nutritionContentWorker.generateCoachQuickPrompt({ context: input.context })
          : nutritionContentWorker.generateDailyTip({ type: input.type, context: input.context }) : null,
        model: devTextModel,
        source: "hunyuan-exp",
      }),
    }),
    feedback: createFeedbackDataService({ db }),
    foodCatalog,
    foodRepository,
    foodInsight,
    foodBarcode: foodBarcodeService,
    foodAdmin: foodAdminService,
    adminConsole: adminConsoleService,
    adminConsoleAuth,
    foodImage: foodImageService,
    foodImageJobs,
    foodImageBatches,
    foodImagePatrol,
    hunyuanImage: hunyuanImageService,
    hunyuanAiAuthMode: aiAuthMode,
    hunyuanAiDiagnostics: {
      authMode: aiAuthMode,
      timeoutMs: aiTimeoutMs,
      hasAmbientSecretId: Boolean(ambientSecretId),
      hasAmbientSecretKey: Boolean(ambientSecretKey),
      hasAmbientSessionToken: Boolean(ambientSessionToken),
      hasExplicitSecret: Boolean(explicitSecretId && explicitSecretKey),
      hasCloudbaseApiKey: Boolean(savedCloudbaseApiKey || config.cloudbaseApiKey),
      modelName: env.HY_IMAGE_MODEL || "HY-Image-3.0-Plus-4090-Tob-v1.0",
    },
    // Prefer a purpose-specific secret.  The fallback keeps the first rollout
    // compatible with the already protected image-worker deployment, without
    // replacing the main function's complete environment-variable set.
    foodImageDispatchSecret: env.FOOD_IMAGE_DISPATCH_SECRET || env.AI_WORKER_SHARED_SECRET || "",
    avatar,
    accountDeletion,
    vision,
    calculateNutritionPlan: calculateNutritionPlanWithAi,
  };
}

function readBearerToken(req) {
  const authorization = req.headers.authorization;
  if (typeof authorization !== "string" || !authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function requireAdminConsoleSession(service, req) {
  const session = service?.verifySession?.(readBearerToken(req));
  if (!session?.sub || session.role !== "admin_console") return null;
  return session;
}

function getDataOperation(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  return ({
    "/profile": "saveProfile",
    "/body-profile": "saveBodyProfile",
    "/goal": "saveGoal",
    "/onboarding": "saveOnboarding",
    "/account": "getAccount",
    "/account/cancel": "cancelAccount",
    "/settings": "saveSettings",
    "/nutrition-plan": "nutritionPlan",
    "/nutrition-plan/preview": "previewNutritionPlan",
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
    "/meal-summary": "getDailySummaryWithInsight",
    "/weekly-review": "getWeeklyReview",
    "/achievements": "getAchievements",
  })[path] ?? null;
}

function getCoachRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/coach/messages") return "getMessages";
  if (path === "/coach/brief") return "getBrief";
  if (path === "/coach-answer") return "sendMessage";
  if (path === "/coach-answer/stream") return "streamMessage";
  if (path === "/coach/restart") return "restartConversation";
  if (path === "/coach/daily-tip") return "getDailyTip";
  return null;
}

function getFoodRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/foods/discover") return { operation: "discover" };
  if (path === "/foods/categories") return { operation: "categories" };
  if (path === "/foods/tags") return { operation: "tags" };
  if (path === "/foods/suggestions") return { operation: "suggestions" };
  if (path === "/foods/images/upload") return { operation: "imageUpload" };
  if (path === "/foods/import/usda") return { operation: "usdaImport" };
  const barcodeMatch = path.match(/^\/foods\/barcode\/(\d{6,14})$/);
  if (barcodeMatch) return { operation: "barcode", barcode: barcodeMatch[1] };
  const imageSyncMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/images\/sync$/i);
  if (imageSyncMatch) return { operation: "imageSync", foodId: imageSyncMatch[1] };
  const insightMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/insight$/i);
  if (insightMatch) return { operation: "insight", foodId: insightMatch[1] };
  const variantsMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/variants$/i);
  if (variantsMatch) return { operation: "variants", foodId: variantsMatch[1] };
  if (path === "/foods") return { operation: "search" };
  const match = path.match(/^\/foods\/([0-9a-f-]{36})$/i);
  return match ? { operation: "detail", foodId: match[1] } : null;
}

function getAdminFoodRoute(pathname) {
  const stripped = pathname.replace(/^\/get-login-ticket/, "");
  if (!stripped.startsWith("/api/admin")) return null;
  const path = stripped.replace(/^\/api\/admin/, "") || "/";
  if (path === "/users") return { operation: "listUsers" };
  if (path === "/login") return { operation: "adminLogin" };
  if (path === "/feedback") return { operation: "listFeedback" };
  const feedbackMatch = path.match(/^\/feedback\/([0-9a-f-]{36})$/i);
  if (feedbackMatch) return { operation: "patchFeedback", feedbackId: feedbackMatch[1] };
  if (path === "/foods/missing-images") return { operation: "missingImages" };
  if (path === "/foods/sync-jobs") return { operation: "syncJobs" };
  if (path === "/food-image-batches") return { operation: "imageBatches" };
  if (path === "/food-image-batches/preview") return { operation: "imageBatchPreview" };
  if (path === "/food-image-batches/first-sample") return { operation: "imageBatchFirstSample" };
  if (path === "/food-image-patrol/rules") return { operation: "imagePatrolRules" };
  const patrolRuleMatch = path.match(/^\/food-image-patrol\/rules\/([0-9a-f-]{36})$/i);
  if (patrolRuleMatch) return { operation: "imagePatrolRuleItem", ruleId: patrolRuleMatch[1] };
  if (path === "/food-image-patrol/quota") return { operation: "imagePatrolQuota" };
  if (path === "/food-image-patrol/run") return { operation: "imagePatrolRun" };
  const batchActionMatch = path.match(/^\/food-image-batches\/([0-9a-f-]{36})\/(start|pause|resume|cancel|worker)$/i);
  if (batchActionMatch) return { operation: "imageBatchAction", batchId: batchActionMatch[1], action: batchActionMatch[2].toLowerCase() };
  const batchMatch = path.match(/^\/food-image-batches\/([0-9a-f-]{36})$/i);
  if (batchMatch) return { operation: "imageBatchDetail", batchId: batchMatch[1] };
  if (path === "/food-image-jobs/batch") return { operation: "imageJobsBatch" };
  if (path === "/food-image-jobs/worker") return { operation: "imageJobsWorker" };
  if (path === "/food-image-jobs/stats") return { operation: "imageJobsStats" };
  if (path === "/food-image-jobs/diagnose") return { operation: "imageJobsDiagnose" };
  if (path === "/food-image-jobs") return { operation: "imageJobs" };
  const jobRetryMatch = path.match(/^\/food-image-jobs\/([0-9a-f-]{36})\/retry$/i);
  if (jobRetryMatch) return { operation: "retryImageJob", jobId: jobRetryMatch[1] };
  const itemRetryMatch = path.match(/^\/food-image-batch-items\/([0-9a-f-]{36})\/retry$/i);
  if (itemRetryMatch) return { operation: "retryImageBatchItem", itemId: itemRetryMatch[1] };
  const jobMatch = path.match(/^\/food-image-jobs\/([0-9a-f-]{36})$/i);
  if (jobMatch) return { operation: "imageJobDetail", jobId: jobMatch[1] };
  const approveMatch = path.match(/^\/food-images\/([0-9a-f-]{36})\/approve$/i);
  if (approveMatch) return { operation: "approveImage", imageId: approveMatch[1] };
  const rejectMatch = path.match(/^\/food-images\/([0-9a-f-]{36})\/reject$/i);
  if (rejectMatch) return { operation: "rejectImage", imageId: rejectMatch[1] };
  const regenerateMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/regenerate-image$/i);
  if (regenerateMatch) return { operation: "regenerateImage", foodId: regenerateMatch[1] };
  const reviewMatch = path.match(/^\/food-images\/([0-9a-f-]{36})\/review$/i);
  if (reviewMatch) return { operation: "reviewImage", imageId: reviewMatch[1] };
  const setPrimaryMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/set-primary-image$/i);
  if (setPrimaryMatch) return { operation: "setPrimaryImage", foodId: setPrimaryMatch[1] };
  if (path === "/foods") return { operation: "adminFoodsCollection" };
  const archiveMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/archive$/i);
  if (archiveMatch) return { operation: "archiveFood", foodId: archiveMatch[1] };
  const restoreMatch = path.match(/^\/foods\/([0-9a-f-]{36})\/restore$/i);
  if (restoreMatch) return { operation: "restoreFood", foodId: restoreMatch[1] };
  const foodPatchMatch = path.match(/^\/foods\/([0-9a-f-]{36})$/i);
  if (foodPatchMatch) return { operation: "adminFoodItem", foodId: foodPatchMatch[1] };
  return null;
}

function getInternalFoodImageRoute(pathname) {
  const path = normalizeFoodImageDispatchPath(pathname);
  return path === "/api/internal/food-image-batches/dispatch" ? { operation: "dispatchImageBatches" } : null;
}

function normalizeFoodImageDispatchPath(pathname) {
  return String(pathname || "").replace(/^\/get-login-ticket/, "");
}

function isFeedbackRoute(pathname) {
  return pathname.replace(/^\/get-login-ticket/, "") === "/feedback";
}

function isVisionRoute(pathname) {
  return pathname.replace(/^\/get-login-ticket/, "") === "/vision-analysis";
}

function isAvatarRoute(pathname) {
  return pathname.replace(/^\/get-login-ticket/, "") === "/profile/avatar";
}

function sendMealError(res, error) {
  if (error instanceof PublicMealDataError || error instanceof PublicMealAnalysisError) {
    const statusCode = error.code === "MEAL_DATA_INVALID" ? 400 : 503;
    sendJson(res, statusCode, { code: error.code, message: error.message || error.code });
    return;
  }
  console.error("[meals] failed:", error?.code || error?.message || error);
  sendJson(res, 503, { code: error?.code || "MEAL_SERVICE_UNAVAILABLE", message: error?.message || "MEAL_SERVICE_UNAVAILABLE" });
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
    const foodRoute = getFoodRoute(url.pathname);
    const adminFoodRoute = getAdminFoodRoute(url.pathname);
    const internalFoodImageRoute = getInternalFoodImageRoute(url.pathname);
    const feedbackRoute = isFeedbackRoute(url.pathname);
    const visionRoute = isVisionRoute(url.pathname);
    const avatarRoute = isAvatarRoute(url.pathname);
    if (url.pathname !== "/" && url.pathname !== "/get-login-ticket" && !dataOperation && !mealRoute && !insightOperation && !coachOperation && !foodRoute && !adminFoodRoute && !internalFoodImageRoute && !feedbackRoute && !visionRoute && !avatarRoute) {
      sendJson(res, 404, { code: "NOT_FOUND" });
      return;
    }
    if (internalFoodImageRoute) {
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        const payload = await readRawJsonBody(req);
        if (!verifyFoodImageDispatchSignature(service?.foodImageDispatchSecret, req, {
          // The CloudBase service gateway strips the function prefix before
          // forwarding, while local HTTP tests keep it.  HMAC only signs the
          // stable route below the function prefix so both forms match.
          path: normalizeFoodImageDispatchPath(url.pathname),
          body: payload.raw,
        })) return sendJson(res, 401, { code: "UNAUTHORIZED" });
        if (!service?.foodImageBatches?.dispatchTrusted) return sendJson(res, 503, { code: "FOOD_IMAGE_DISPATCH_UNAVAILABLE" });
        let patrol;
        if (typeof service.foodImagePatrol?.runTrusted === "function") {
          try {
            patrol = await service.foodImagePatrol.runTrusted();
          } catch (error) {
            console.error("[food-image-patrol] failed:", error?.code || error?.message || error);
            patrol = { error: error?.code || "FOOD_IMAGE_PATROL_FAILED", message: String(error?.message || error).slice(0, 300) };
          }
        }
        const dispatch = await service.foodImageBatches.dispatchTrusted({ maxItems: payload.body?.maxItems });
        return sendJson(res, 200, patrol === undefined ? dispatch : { ...dispatch, patrol });
      } catch (error) {
        console.error("[food-image-dispatch] failed:", error?.code || error?.message || error);
        return sendJson(res, 503, { code: "FOOD_IMAGE_DISPATCH_FAILED" });
      }
    }
    if (avatarRoute) {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.avatar?.upload) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        return sendJson(res, 200, await service.avatar.upload(session.sub, await readJsonBody(req, MAX_VISION_BODY_BYTES)));
      } catch (error) {
        console.error("[avatar-upload] failed:", error?.message || error);
        if (error instanceof PublicProfileAvatarError) return sendJson(res, 400, { code: error.code });
        return sendJson(res, 503, { code: "AVATAR_UPLOAD_FAILED", message: String(error?.message || error) });
      }
    }
    if (foodRoute) {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try {
        // New unified-model endpoints (food_repository). These do not require
        // USDA_FDC_API_KEY; they read from the local foods/categories/tags tables.
        if (foodRoute.operation === "categories") {
          return sendJson(res, 200, { items: await service.foodRepository.listCategories() });
        }
        if (foodRoute.operation === "tags") {
          return sendJson(res, 200, { items: await service.foodRepository.listTags() });
        }
        if (foodRoute.operation === "suggestions") {
          const q = url.searchParams.get("q") ?? url.searchParams.get("query") ?? "";
          const limit = Number(url.searchParams.get("limit") ?? "8");
          return sendJson(res, 200, { items: await service.foodRepository.suggestions(q, limit) });
        }
        if (foodRoute.operation === "insight") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodInsight?.getInsight) return sendJson(res, 503, { code: "FOOD_INSIGHT_UNAVAILABLE" });
          const food = await service.foodRepository.getFoodById(foodRoute.foodId);
          if (!food) return sendJson(res, 404, { code: "FOOD_NOT_FOUND" });
          return sendJson(res, 200, await service.foodInsight.getInsight(food, { preferFast: true }));
        }
        if (foodRoute.operation === "variants") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const variants = await service.foodRepository.listFoodVariants(foodRoute.foodId);
          return sendJson(res, 200, { items: variants.map(mapRepositoryFoodForCatalog) });
        }
        if (foodRoute.operation === "barcode") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodBarcode.lookup(foodRoute.barcode));
        }
        if (foodRoute.operation === "imageUpload") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          // Logged-in users may upload candidate images (status=pending, never primary).
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          if (!body?.imageBase64) return sendJson(res, 400, { code: "FOOD_IMAGE_UPLOAD_EMPTY" });
          const buffer = Buffer.from(String(body.imageBase64), "base64");
          const acquired = await service.foodImage.acquireFromUpload({
            buffer, contentType: body.contentType || "image/jpeg",
            imageEntityKey: body.imageEntityKey,
            uploadedBy: session.sub,
          });
          const image = await service.foodRepository.insertImage({
            food_id: body.foodId ?? null,
            image_entity_key: acquired.storagePath ? acquired.storagePath.split("/")[1] : null,
            image_type: body.imageType || "ingredient",
            source: "user_upload",
            storage_path: acquired.storagePath,
            thumb_url: acquired.thumbUrl,
            medium_url: acquired.mediumUrl,
            detail_url: acquired.detailUrl,
            mime_type: acquired.mimeType,
            width: acquired.width,
            height: acquired.height,
            file_size: acquired.fileSize,
            content_hash: acquired.contentHash,
            is_primary: false,
            is_verified: false,
            status: "pending",
            uploaded_by: session.sub,
          });
          return sendJson(res, 200, { image });
        }
        if (foodRoute.operation === "usdaImport") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.foodAdmin.importUsda(session.sub, body || {}));
        }
        if (foodRoute.operation === "imageSync") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodAdmin.syncImages(session.sub, foodRoute.foodId));
        }
        if (foodRoute.operation === "discover") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const limitValue = Number(url.searchParams.get("limit") ?? "10");
          const limit = Number.isInteger(limitValue) && limitValue > 0 ? Math.min(limitValue, 50) : 10;
          const pageValue = Number(url.searchParams.get("page") ?? "1");
          const page = Number.isInteger(pageValue) && pageValue > 0 ? pageValue : 1;
          const result = mapRepositoryCatalogResult(await service.foodRepository.listFoods({
            page, pageSize: limit, sort: "recommended",
          }));
          result.items = shuffleCatalogItems(result.items);
          return sendJson(res, 200, result);
        }
        if (foodRoute.operation === "search") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const query = url.searchParams.get("query");
          const page = Number(url.searchParams.get("page") ?? "1");
          const categoryCode = url.searchParams.get("category");
          return sendJson(res, 200, mapRepositoryCatalogResult(await service.foodRepository.listFoods({
            q: query,
            categoryCode,
            page,
            pageSize: 20,
            sort: "recommended",
          })));
        }
        // Legacy USDA-backed detail route remains available for old cached records.
        if (!service.foodCatalog) return sendJson(res, 401, { code: "UNAUTHORIZED" });
        if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        return sendJson(res, 200, await service.foodCatalog.getById(session.sub, foodRoute.foodId));
      } catch (error) {
        if (error instanceof PublicFoodCatalogError) return sendJson(res, 400, { code: error.code });
        if (error instanceof FoodBarcodeError) return sendJson(res, error.code === "FOOD_BARCODE_NOT_FOUND" ? 404 : 400, { code: error.code });
        if (error instanceof FoodImageError) return sendJson(res, 400, { code: error.code });
        if (error instanceof FoodAdminError) return sendJson(res, error.code === "FORBIDDEN" ? 403 : (error.code === "UNAUTHORIZED" ? 401 : 400), { code: error.code });
        if (error instanceof FoodRepositoryError) return sendJson(res, 400, { code: error.code });
        return sendJson(res, 503, { code: "FOOD_CATALOG_UNAVAILABLE" });
      }
    }
    if (adminFoodRoute) {
      if (adminFoodRoute.operation === "adminLogin") {
        if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        if (!service?.adminConsoleAuth?.login) return sendJson(res, 503, { code: "ADMIN_AUTH_NOT_CONFIGURED" });
        try {
          return sendJson(res, 200, await service.adminConsoleAuth.login(await readJsonBody(req)));
        } catch (error) {
          if (error instanceof PublicAdminAuthError) {
            const status = error.code === "ADMIN_AUTH_NOT_CONFIGURED" ? 503 : 401;
            return sendJson(res, status, { code: error.code, message: error.message });
          }
          console.error("[admin-login] failed:", error?.message || error);
          return sendJson(res, 503, { code: "ADMIN_AUTH_FAILED" });
        }
      }
      const session = requireAdminConsoleSession(service, req);
      if (!session?.sub) return sendJson(res, 401, { code: "UNAUTHORIZED", message: "请先使用帐号密码登录后台" });
      try {
        if (adminFoodRoute.operation === "listUsers") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.adminConsole) return sendJson(res, 503, { code: "FOOD_ADMIN_UNAVAILABLE" });
          return sendJson(res, 200, await service.adminConsole.listUsers(session.sub, {
            q: url.searchParams.get("q") || "",
            limit: url.searchParams.get("limit"),
          }));
        }
        if (adminFoodRoute.operation === "listFeedback") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.adminConsole) return sendJson(res, 503, { code: "FOOD_ADMIN_UNAVAILABLE" });
          return sendJson(res, 200, await service.adminConsole.listFeedback(session.sub, {
            status: url.searchParams.get("status") || undefined,
            limit: url.searchParams.get("limit"),
          }));
        }
        if (adminFoodRoute.operation === "patchFeedback") {
          if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.adminConsole) return sendJson(res, 503, { code: "FOOD_ADMIN_UNAVAILABLE" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.adminConsole.updateFeedbackStatus(session.sub, adminFoodRoute.feedbackId, body || {}));
        }
        if (adminFoodRoute.operation === "missingImages") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const limit = Number(url.searchParams.get("limit") ?? "50");
          return sendJson(res, 200, { items: await service.foodAdmin.listMissingImages(session.sub, limit) });
        }
        if (adminFoodRoute.operation === "syncJobs") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const limit = Number(url.searchParams.get("limit") ?? "20");
          return sendJson(res, 200, { items: await service.foodAdmin.listSyncJobs(session.sub, limit) });
        }
        if (adminFoodRoute.operation === "imageBatches") {
          if (req.method === "GET") {
            return sendJson(res, 200, await service.foodImageBatches.list(session.sub, {
              page: Number(url.searchParams.get("page") ?? "1"),
              pageSize: Number(url.searchParams.get("pageSize") ?? "20"),
            }));
          }
          if (req.method === "POST") {
            const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
            const create = body?.categoryId ? service.foodImageBatches.createFromCategory : service.foodImageBatches.create;
            return sendJson(res, 200, await create.call(service.foodImageBatches, session.sub, body || {}));
          }
          return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        }
        if (adminFoodRoute.operation === "imageBatchPreview") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImageBatches?.previewCategory) {
            return sendJson(res, 503, { code: "FOOD_ADMIN_UNAVAILABLE", message: "生图批次服务未就绪" });
          }
          // Preview payloads are tiny; avoid the 30MB vision body reader path.
          const body = await readJsonBody(req, 16 * 1024);
          try {
            return sendJson(res, 200, await service.foodImageBatches.previewCategory(session.sub, body || {}));
          } catch (error) {
            console.error("[food-image-batches/preview] failed:", error?.code || error?.message || error);
            throw error;
          }
        }
        if (adminFoodRoute.operation === "imageBatchFirstSample") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodImageBatches.createFirstSample(session.sub));
        }
        if (adminFoodRoute.operation === "imagePatrolRules") {
          if (!service.foodImagePatrol) return sendJson(res, 503, { code: "FOOD_IMAGE_PATROL_UNAVAILABLE" });
          if (req.method === "GET") return sendJson(res, 200, await service.foodImagePatrol.listRules(session.sub));
          if (req.method === "POST") {
            const body = await readJsonBody(req, 16 * 1024);
            return sendJson(res, 200, await service.foodImagePatrol.upsertRule(session.sub, body || {}));
          }
          return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        }
        if (adminFoodRoute.operation === "imagePatrolRuleItem") {
          if (!service.foodImagePatrol) return sendJson(res, 503, { code: "FOOD_IMAGE_PATROL_UNAVAILABLE" });
          if (req.method === "DELETE") {
            return sendJson(res, 200, await service.foodImagePatrol.deleteRule(session.sub, adminFoodRoute.ruleId));
          }
          if (req.method === "PATCH") {
            const body = await readJsonBody(req, 16 * 1024);
            if (typeof body?.enabled === "boolean") {
              return sendJson(res, 200, await service.foodImagePatrol.setEnabled(session.sub, adminFoodRoute.ruleId, body.enabled));
            }
            return sendJson(res, 200, await service.foodImagePatrol.upsertRule(session.sub, {
              ...(body || {}),
              categoryId: body?.categoryId,
            }));
          }
          return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        }
        if (adminFoodRoute.operation === "imagePatrolQuota") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImagePatrol) return sendJson(res, 503, { code: "FOOD_IMAGE_PATROL_UNAVAILABLE" });
          return sendJson(res, 200, await service.foodImagePatrol.remainingQuota(session.sub));
        }
        if (adminFoodRoute.operation === "imagePatrolRun") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImagePatrol) return sendJson(res, 503, { code: "FOOD_IMAGE_PATROL_UNAVAILABLE" });
          return sendJson(res, 200, await service.foodImagePatrol.runNow(session.sub));
        }
        if (adminFoodRoute.operation === "imageBatchDetail") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodImageBatches.get(session.sub, adminFoodRoute.batchId, {
            page: Number(url.searchParams.get("page") ?? "1"),
            pageSize: Number(url.searchParams.get("pageSize") ?? "50"),
          }));
        }
        if (adminFoodRoute.operation === "imageBatchAction") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const action = adminFoodRoute.action;
          if (action === "worker") return sendJson(res, 200, await service.foodImageBatches.processNext(session.sub, adminFoodRoute.batchId));
          return sendJson(res, 200, await service.foodImageBatches[action](session.sub, adminFoodRoute.batchId));
        }
        if (adminFoodRoute.operation === "imageJobsStats") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodImageJobs.getStats(session.sub));
        }
        if (adminFoodRoute.operation === "imageJobsDiagnose") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.hunyuanImage) {
            return sendJson(res, 200, {
              ok: false,
              stage: "init",
              error: "hunyuanImage service is null — check FOOD_IMAGE_GENERATION_ENABLED and @cloudbase/ai",
              diagnostics: service.hunyuanAiDiagnostics || null,
            });
          }
          try {
            const sample = await service.hunyuanImage.generateOne({
              foodNameZh: "水煮鸡胸肉",
              foodNameEn: "Boiled chicken breast",
              category: "肉禽",
              cookingMethod: "水煮",
              extraPrompt: "diagnose only",
            });
            return sendJson(res, 200, {
              ok: true,
              stage: "generate",
              diagnostics: service.hunyuanAiDiagnostics || null,
              modelName: service.hunyuanImage.modelName,
              size: service.hunyuanImage.size,
              hasTemporaryUrl: Boolean(sample.temporaryUrl),
              temporaryUrlHost: (() => {
                try { return new URL(sample.temporaryUrl).host; } catch { return null; }
              })(),
              promptChars: sample.prompt?.length ?? 0,
            });
          } catch (error) {
            return sendJson(res, 200, {
              ok: false,
              stage: "generate",
              diagnostics: service.hunyuanAiDiagnostics || null,
              modelName: service.hunyuanImage.modelName,
              size: service.hunyuanImage.size,
              errorCode: error?.code || "HY_IMAGE_GENERATE_FAILED",
              errorMessage: String(error?.message || error).slice(0, 1200),
              errorRaw: (() => {
                try {
                  return JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 1500);
                } catch {
                  return String(error).slice(0, 500);
                }
              })(),
            });
          }
        }
        if (adminFoodRoute.operation === "imageJobsBatch") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.foodImageJobs.createBatch(session.sub, body || {}));
        }
        if (adminFoodRoute.operation === "imageJobsWorker") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.foodImageJobs.processQueue(session.sub, body || {}));
        }
        if (adminFoodRoute.operation === "imageJobs") {
          if (req.method === "GET") {
            return sendJson(res, 200, await service.foodImageJobs.listJobs(session.sub, {
              status: url.searchParams.get("status") || undefined,
              foodId: url.searchParams.get("foodId") || undefined,
              page: Number(url.searchParams.get("page") ?? "1"),
              pageSize: Number(url.searchParams.get("pageSize") ?? "20"),
            }));
          }
          if (req.method === "POST") {
            const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
            return sendJson(res, 200, await service.foodImageJobs.createJob(session.sub, body || {}));
          }
          return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        }
        if (adminFoodRoute.operation === "imageJobDetail") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodImageJobs.getJob(session.sub, adminFoodRoute.jobId));
        }
        if (adminFoodRoute.operation === "retryImageJob") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (typeof service.foodImageBatches?.retryRejectedJob !== "function") {
            return sendJson(res, 503, { code: "FOOD_IMAGE_BATCH_UNAVAILABLE" });
          }
          return sendJson(res, 200, await service.foodImageBatches.retryRejectedJob(session.sub, adminFoodRoute.jobId));
        }
        if (adminFoodRoute.operation === "retryImageBatchItem") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (typeof service.foodImageBatches?.retryFailedItem !== "function") {
            return sendJson(res, 503, { code: "FOOD_IMAGE_BATCH_UNAVAILABLE" });
          }
          return sendJson(res, 200, await service.foodImageBatches.retryFailedItem(session.sub, adminFoodRoute.itemId));
        }
        if (adminFoodRoute.operation === "approveImage") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodImageJobs.approveImage(session.sub, adminFoodRoute.imageId));
        }
        if (adminFoodRoute.operation === "rejectImage") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          const rejected = await service.foodImageJobs.rejectImage(session.sub, adminFoodRoute.imageId, body || {});
          let retry = { processed: 0, retryScheduled: false };
          if (rejected.jobId && typeof service.foodImageBatches?.retryRejectedJob === "function") {
            try {
              retry = await service.foodImageBatches.retryRejectedJob(session.sub, rejected.jobId);
            } catch (error) {
              retry = {
                processed: 0,
                retryScheduled: false,
                errorCode: error?.code || "FOOD_IMAGE_RETRY_START_FAILED",
                errorMessage: String(error?.message || error).slice(0, 500),
              };
            }
          }
          return sendJson(res, 200, { ...rejected, retry });
        }
        if (adminFoodRoute.operation === "regenerateImage") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.foodImageJobs.regenerate(session.sub, adminFoodRoute.foodId, body || {}));
        }
        if (adminFoodRoute.operation === "reviewImage") {
          if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.foodAdmin.reviewImage(session.sub, adminFoodRoute.imageId, body || {}));
        }
        if (adminFoodRoute.operation === "setPrimaryImage") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.foodAdmin.setPrimaryImage(session.sub, adminFoodRoute.foodId, body?.imageId));
        }
        if (adminFoodRoute.operation === "adminFoodsCollection") {
          if (req.method === "GET") {
            return sendJson(res, 200, await service.foodAdmin.listFoods(session.sub, {
              q: url.searchParams.get("q") || url.searchParams.get("query") || "",
              categoryCode: url.searchParams.get("categoryCode") || url.searchParams.get("category_code") || undefined,
              active: url.searchParams.get("active") || "true",
              missingImage: url.searchParams.get("missingImage") || url.searchParams.get("missing_image") || undefined,
              missingImageSubject: url.searchParams.get("missingImageSubject") || url.searchParams.get("missing_image_subject") || undefined,
              page: url.searchParams.get("page") || undefined,
              pageSize: url.searchParams.get("pageSize") || url.searchParams.get("page_size") || undefined,
            }));
          }
          if (req.method === "POST") {
            const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
            return sendJson(res, 201, await service.foodAdmin.createFood(session.sub, body || {}));
          }
          return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        }
        if (adminFoodRoute.operation === "archiveFood") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodAdmin.archiveFood(session.sub, adminFoodRoute.foodId));
        }
        if (adminFoodRoute.operation === "restoreFood") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          return sendJson(res, 200, await service.foodAdmin.restoreFood(session.sub, adminFoodRoute.foodId));
        }
        if (adminFoodRoute.operation === "adminFoodItem") {
          if (req.method === "GET") {
            return sendJson(res, 200, await service.foodAdmin.getFood(session.sub, adminFoodRoute.foodId));
          }
          if (req.method === "PATCH") {
            const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
            return sendJson(res, 200, await service.foodAdmin.updateFood(session.sub, adminFoodRoute.foodId, body || {}));
          }
          return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        }
      } catch (error) {
        if (error instanceof AdminConsoleError) {
          const code = error.code;
          const status = code === "FORBIDDEN" ? 403
            : code === "UNAUTHORIZED" ? 401
            : code === "FEEDBACK_NOT_FOUND" ? 404
            : code === "FEEDBACK_STATUS_INVALID" ? 400
            : 503;
          return sendJson(res, status, { code });
        }
        if (error instanceof FoodAdminError || error instanceof FoodImageJobError || error instanceof FoodImageBatchError || error instanceof FoodImagePatrolError || error instanceof HunyuanImageError) {
          const code = error.code;
          const status = code === "FORBIDDEN" ? 403
            : code === "UNAUTHORIZED" ? 401
            : code === "FOOD_NOT_FOUND" ? 404
            : 400;
          return sendJson(res, status, { code, message: error.message || code });
        }
        if (error instanceof FoodRepositoryError) {
          return sendJson(res, 400, { code: error.code, message: error.message || error.code });
        }
        console.error("[food-admin] failed:", error?.message || error);
        return sendJson(res, 503, { code: "FOOD_ADMIN_UNAVAILABLE", message: error?.message || "FOOD_ADMIN_UNAVAILABLE" });
      }
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
          if (from && to) {
            const light = url.searchParams.get("light") === "1";
            return sendJson(
              res,
              200,
              await service.meals.listMealsRange(session.sub, from, to, { resolveImages: !light }),
            );
          }
          return sendJson(res, 400, { code: "MEAL_DATA_INVALID" });
        }
        if (mealRoute.operation === "meal" && req.method === "GET") {
          return sendJson(res, 200, await service.meals.getMeal(session.sub, mealRoute.mealId, { hydrate: true }));
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
      if (!date) return sendJson(res, 400, { code: "INSIGHT_DATA_INVALID", message: "缺少日期参数" });
      try {
        const preferFast = url.searchParams.get("preferFast") === "1";
        if (insightOperation === "getDailySummaryWithInsight") {
          // Home / meal-records: never block the summary on LLM; upgrade cache in background.
          return sendJson(res, 200, await service.insights.getDailySummaryWithInsight(session.sub, date, { preferFast: true }));
        }
        if (insightOperation === "getWeeklyReview") {
          return sendJson(res, 200, await service.insights.getWeeklyReview(session.sub, date, { preferFast }));
        }
        return sendJson(res, 200, await service.insights[insightOperation](session.sub, date));
      } catch (error) {
        const code = error?.code || (String(error?.message || "").includes("Invalid date") ? "INSIGHT_DATA_INVALID" : "INSIGHT_SERVICE_UNAVAILABLE");
        const status = code === "INSIGHT_DATA_INVALID" || code === "MEAL_DATA_INVALID" ? 400 : 503;
        console.error("[insights] failed:", code, error?.message || error);
        return sendJson(res, status, { code, message: error?.message || code });
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
        if (coachOperation === "getDailyTip" && req.method === "GET") {
          const date = url.searchParams.get("date");
          if (!date) return sendJson(res, 400, { code: "COACH_INPUT_INVALID" });
          const refresh = url.searchParams.get("refresh") === "1" || url.searchParams.get("refresh") === "true";
          return sendJson(res, 200, await service.coach.getDailyTip(session.sub, date, { refresh }));
        }
        if (coachOperation === "restartConversation" && req.method === "POST") {
          return sendJson(res, 200, await service.coach.restartConversation(session.sub));
        }
        if (coachOperation === "sendMessage" && req.method === "POST") {
          return sendJson(res, 200, await service.coach.sendMessage(session.sub, await readJsonBody(req)));
        }
        if (coachOperation === "streamMessage" && req.method === "POST") {
          const body = await readJsonBody(req);
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache",
            ...CORS_HEADERS,
          });
          try {
            for await (const event of service.coach.streamMessage(session.sub, body)) {
              res.write(`${JSON.stringify(event)}\n`);
            }
          } catch {
            res.write(`${JSON.stringify({ type: "error", code: "COACH_SERVICE_UNAVAILABLE" })}\n`);
          }
          res.end();
          return;
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
        if (error instanceof PublicVisionDataError || error instanceof PublicVisionError || error instanceof PublicQwenVisionError) {
          const statusCode = error.code === "VISION_IMAGE_INVALID" || error.code === "VISION_RESULT_INVALID" || error.code === "VISION_NON_FOOD" ? 400 : 503;
          console.error("[vision] known error:", error.code, error.message);
          return sendJson(res, statusCode, { code: error.code, message: error.message });
        }
        console.error("[vision] unexpected error:", error?.message || error, error?.stack || "");
        return sendJson(res, 503, { code: "VISION_SERVICE_UNAVAILABLE", message: "识别服务暂时不可用，请稍后重试" });
      }
    }
    if (dataOperation === "getAccount" && req.method === "GET") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service.data?.getAccount) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.getAccount(session.sub)); } catch { return sendJson(res, 503, { code: "ACCOUNT_READ_FAILED" }); }
    }
    if (dataOperation === "cancelAccount") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub || !service?.accountDeletion?.cancelAccount) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        return sendJson(res, 200, await service.accountDeletion.cancelAccount(session.sub, await readJsonBody(req)));
      } catch (error) {
        if (error instanceof PublicAccountDeletionError || error instanceof PublicOperationError) {
          return sendJson(res, error instanceof PublicOperationError ? 409 : 400, { code: error.code });
        }
        console.error("[account-cancellation] failed:", error?.code || "UNKNOWN", error?.message || error);
        return sendJson(res, 503, { code: "ACCOUNT_CANCELLATION_FAILED" });
      }
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
    if (dataOperation === "previewNutritionPlan" && req.method === "POST") {
      const session = service?.verifySession?.(readBearerToken(req));
      if (!session?.sub) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try {
        const body = await readJsonBody(req);
        let plan = null;
        if (typeof service.calculateNutritionPlan === "function") {
          plan = await service.calculateNutritionPlan(body);
        }
        if (!plan) plan = formulaNutritionPlanFallback(body);
        return sendJson(res, 200, plan);
      } catch (error) {
        console.error("[nutrition-plan/preview] failed:", error?.message || error);
        return sendJson(res, 503, { code: "NUTRITION_PLAN_PREVIEW_FAILED" });
      }
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
  createHunyuanGenerationService,
  createRuntimeService,
  readRuntimeConfig,
  selectDeepseekModel,
  requestWechatSession,
  shuffleCatalogItems,
  signFoodImageDispatch,
  verifyFoodImageDispatchSignature,
};
