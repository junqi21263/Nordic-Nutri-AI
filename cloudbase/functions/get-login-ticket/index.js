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
const { createMilestoneStateService, eventSourceForMutation } = require("./milestone-state-service.cjs");
const { createAchievementStateService } = require("./achievement-state-service.cjs");
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
const { createProactiveDailyBriefService } = require("./proactive-daily-brief-service.cjs");
const { createCoachDataService, PublicCoachDataError } = require("./coach-data-service.cjs");
const { createFeedbackDataService, PublicFeedbackError } = require("./feedback-data-service.cjs");
const { createVitaVisionService, PublicVisionError } = require("./vita-vision-service.cjs");
const { createQwenVisionService, PublicQwenVisionError } = require("./qwen-vision-service.cjs");
const { createVisionDataService, PublicVisionDataError } = require("./vision-data-service.cjs");
const { createWechatImageSecurity, PublicImageSecurityError } = require("./wechat-image-security.cjs");
const { createVisionImageRetentionService } = require("./vision-image-retention-service.cjs");
const { createVisionImageReviewService } = require("./vision-image-review-service.cjs");
const { createUserImageOpsService, PublicUserImageError } = require("./user-image-ops-service.cjs");
const { createFoodCatalogService, PublicFoodCatalogError } = require("./food-catalog-service.cjs");
const { createFoodQueryTranslator } = require("./food-query-translator.cjs");
const { createNutritionBackfillService } = require("./nutrition-backfill-service.cjs");
const { createProfileAvatarService, PublicProfileAvatarError, pickDefaultAvatarSentinel } = require("./profile-avatar-service.cjs");
const { createAccountDeletionService, PublicAccountDeletionError } = require("./account-deletion-service.cjs");
const { createProductUserExists, resolveProductSession } = require("./product-session-auth.cjs");
const { createOperationGuard, PublicOperationError } = require("./operation-guard.cjs");
const { createObservabilityService } = require("./observability-service.cjs");
const { recordModelUsage } = require("./model-usage.cjs");
const { createContentModerationService, PublicContentModerationError } = require("./content-moderation-service.cjs");
const { createAdminConsoleAuthService, createPersistentLoginAttemptTracker, PublicAdminAuthError } = require("./admin-console-auth-service.cjs");
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
const { createFoodImageAuditVision } = require("./food-image-audit-vision.cjs");
const { createFoodImageAuditService } = require("./food-image-audit-service.cjs");
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
// ~4MB decoded image ≈ ~5.4MB base64 + JSON envelope.
const MAX_VISION_BODY_BYTES = 6 * 1024 * 1024;
const VISION_DAILY_LIMIT = 10;
// Keep the model catalog and account-usage fallback aligned with the active
// quota. This alias also protects the public login bootstrap from a missing
// catalog constant when the temporary unlimited-QA switch is removed.
const VISION_EFFECTIVE_DAILY_LIMIT = VISION_DAILY_LIMIT;
const VISION_BURST_LIMIT = 3;
const VISION_DAILY_WINDOW_SECONDS = 86400;
const VISION_BURST_WINDOW_SECONDS = 600;
const COACH_DAILY_MESSAGE_LIMIT = 20;
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
  const categoryCode = food?.category?.code ?? null;
  const rootCode = typeof categoryCode === "string" ? categoryCode.split(".")[0] : "";
  const inferredTagCodes = [];
  if (Number(nutrition.protein) >= 15) inferredTagCodes.push("high_protein");
  if (Number.isFinite(Number(nutrition.fat)) && Number(nutrition.fat) <= 3) inferredTagCodes.push("low_fat");
  if (Number(nutrition.carbs) >= 30) inferredTagCodes.push("high_carb");
  if (Number.isFinite(Number(nutrition.calories)) && Number(nutrition.calories) <= 100) inferredTagCodes.push("low_calorie");
  if (Number.isFinite(Number(nutrition.fiber)) && Number(nutrition.fiber) >= 5) inferredTagCodes.push("high_fiber");
  if (["plant_protein", "grains_tubers", "soy", "grain"].includes(rootCode)) inferredTagCodes.push("plant_protein");
  const tagLabels = {
    high_protein: "高蛋白",
    low_fat: "低脂",
    high_carb: "高碳水",
    low_calorie: "低热量",
    plant_protein: "植物蛋白",
    high_fiber: "高膳食纤维",
  };
  const dbTags = Array.isArray(food?.tags)
    ? food.tags.map((tag) => ({ code: tag.code, nameZh: tag.nameZh || tagLabels[tag.code] || tag.code }))
    : [];
  const tagByCode = new Map(dbTags.map((tag) => [tag.code, tag]));
  for (const code of inferredTagCodes) {
    if (!tagByCode.has(code)) tagByCode.set(code, { code, nameZh: tagLabels[code] || code });
  }
  return {
    id: food.id,
    source: food.source,
    sourceFoodId: food.sourceId,
    description: getFoodDisplayName(food),
    brandName: food.brandName ?? null,
    dataType: food.foodForm ?? null,
    category: categoryCode,
    servingSize: food.servingSize ?? null,
    servingUnit: food.servingUnit ?? null,
    caloriesKcalPer100g: nutrition.calories ?? null,
    proteinGPer100g: nutrition.protein ?? null,
    carbsGPer100g: nutrition.carbs ?? null,
    fatGPer100g: nutrition.fat ?? null,
    fiberGPer100g: nutrition.fiber ?? null,
    tags: Array.from(tagByCode.values()),
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
  const missing = required.filter((name) => typeof env[name] !== "string" || !env[name]);
  if (missing.length) {
    // Only expose configuration *names*. Values are credentials and must never
    // be written to function logs.
    throw new Error(`Login service configuration is incomplete: ${missing.join(", ")}`);
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

function buildModelCatalog({ env = process.env, vision = null, hunyuanModel = null, deepseekModel = null } = {}) {
  const textModel = typeof env.HY_TEXT_MODEL === "string" && env.HY_TEXT_MODEL.trim()
    ? env.HY_TEXT_MODEL.trim()
    : "hunyuan-2.0-instruct-20251111";
  const resolvedDeepseek = deepseekModel || selectDeepseekModel(env.DEEPSEEK_MODEL);
  return [
    {
      feature: "vision",
      featureLabel: "食物识别",
      provider: vision?.provider || (env.QWEN_API_KEY || env.DASHSCOPE_API_KEY ? "qwen" : "vita"),
      model: vision?.model || env.QWEN_VL_FLASH_MODEL || env.VITA_MODEL || "qwen3-vl-flash",
      dailyLimit: VISION_EFFECTIVE_DAILY_LIMIT,
      burstLimit: VISION_BURST_LIMIT,
      burstWindowSeconds: VISION_BURST_WINDOW_SECONDS,
    },
    {
      feature: "coach",
      featureLabel: "营养教练",
      provider: "deepseek",
      model: resolvedDeepseek,
      dailyLimit: COACH_DAILY_MESSAGE_LIMIT,
    },
    {
      feature: "daily_insight",
      featureLabel: "每日洞察",
      provider: "deepseek",
      model: resolvedDeepseek,
    },
    {
      feature: "weekly_review",
      featureLabel: "周回顾",
      provider: "deepseek",
      model: resolvedDeepseek,
    },
    {
      feature: "nutrition_plan",
      featureLabel: "营养计划",
      provider: "deepseek",
      model: resolvedDeepseek,
    },
    {
      feature: "daily_tip",
      featureLabel: "每日小贴士",
      provider: "hunyuan",
      model: textModel,
    },
    {
      feature: "proactive_daily_brief",
      featureLabel: "NOVA 每日提醒",
      provider: "deepseek",
      model: resolvedDeepseek,
    },
    {
      feature: "food_image",
      featureLabel: "食材生图",
      provider: "hunyuan",
      model: hunyuanModel || env.HY_IMAGE_MODEL || "HY-Image-3.0-Plus-4090-Tob-v1.0",
      dailyLimit: Number(env.HY_IMAGE_DAILY_LIMIT) || 500,
    },
  ];
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
  const opsRef = { observability: null };
  const cloudbase = dependencies.cloudbaseSdk ?? require("@cloudbase/js-sdk");
  const app = cloudbase.init({
    env: config.cloudbaseEnvId,
    accessKey: config.cloudbaseApiKey,
    auth: { detectSessionInUrl: false },
  });
  const db = typeof app.rdb === "function" ? app.rdb() : app.rdb;
  if (!db || typeof db.from !== "function") throw new Error("Relational database client is unavailable");
  const deepseekModel = selectDeepseekModel(env.DEEPSEEK_MODEL);
  const evaluateMealRaw = typeof env.DEEPSEEK_API_KEY === "string" && env.DEEPSEEK_API_KEY
    ? createDeepseekEvaluationService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
    : null;
  const evaluateMeal = evaluateMealRaw
    ? async (input) => {
      const result = await evaluateMealRaw(input);
      if (result?.usage) {
        recordModelUsage(opsRef.observability, {
          model: result.model || deepseekModel,
          feature: "meal_evaluation",
          provider: "deepseek",
          usage: result.usage,
          requests: 0,
        }).catch(() => {});
      }
      return result;
    }
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

      // Seed a default profile (food avatar + generated nickname) when missing, so
      // home/profile screens show a friendly identity instead of the "微信用户" placeholder.
      // Also backfills existing users who logged in before defaults were introduced.
      const defaultAvatarPath = pickDefaultAvatarSentinel();
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
  // The product login path only needs the RDB client above. Storage/AI/admin
  // helpers must not make an otherwise valid WeChat login return 503 when the
  // Node SDK cannot initialize in a particular SCF runtime.
  let admin = null;
  try {
    admin = cloudbaseNode.init({
      env: config.cloudbaseEnvId,
      accessKey: config.cloudbaseApiKey,
    });
  } catch (error) {
    console.error("[storage] API-key runtime init failed; continuing without fallback:", error?.message || error);
  }
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
  const storageEnvId = String(env.TCB_ENV || env.SCF_NAMESPACE || "").trim();
  const toCloudFileCandidates = (rawPath) => {
    if (typeof rawPath !== "string") return [];
    const path = rawPath.trim();
    if (!path) return [];
    if (path.startsWith("default:") || path.startsWith("data:") || /^https?:\/\//i.test(path)) return [];
    if (/^cloud:\/\//i.test(path)) return [path];
    // Vision upload race often persists relative cloudPath while the object exists under env prefix.
    const cleaned = path.replace(/^\//, "");
    if (!cleaned || cleaned.includes("://")) return [];
    return storageEnvId ? [`cloud://${storageEnvId}/${cleaned}`] : [cleaned];
  };
  const storageClients = () => [storageRuntime, admin].filter(Boolean);
  const getTemporaryUrl = async (fileId) => {
    // Inline / sentinel avatar refs are already displayable — never resolve via Storage.
    if (typeof fileId === "string") {
      if (fileId.startsWith("default:")) return fileId;
      if (fileId.startsWith("data:")) return fileId;
      if (/^https?:\/\//i.test(fileId)) return fileId;
    }
    const candidates = toCloudFileCandidates(fileId);
    const clients = storageClients();
    for (const candidate of (candidates.length ? candidates : [fileId])) {
      for (const client of clients) {
        if (typeof client?.getTempFileURL !== "function") continue;
        try {
          const result = await client.getTempFileURL({ fileList: [candidate] });
          const url = result?.fileList?.[0]?.tempFileURL ?? null;
          if (url) return url;
        } catch (error) {
          console.error("[storage] getTempFileURL failed:", candidate, error?.message || error);
        }
      }
    }
    return null;
  };
  const resolveTempFileUrls = async (fileIds = []) => {
    const map = new Map();
    const fileIdToOriginals = new Map();
    for (const original of fileIds || []) {
      if (typeof original !== "string" || !original) continue;
      if (original.startsWith("data:") || original.startsWith("default:") || /^https?:\/\//i.test(original)) {
        map.set(original, original);
        continue;
      }
      for (const candidate of toCloudFileCandidates(original)) {
        if (!fileIdToOriginals.has(candidate)) fileIdToOriginals.set(candidate, new Set());
        fileIdToOriginals.get(candidate).add(original);
      }
    }
    const unique = [...fileIdToOriginals.keys()];
    if (!unique.length) return map;

    const applyEntry = (fileId, tempFileURL) => {
      if (!tempFileURL) return;
      if (fileId) map.set(fileId, tempFileURL);
      for (const original of fileIdToOriginals.get(fileId) || []) {
        map.set(original, tempFileURL);
      }
    };

    const clients = storageClients();
    const ingestResult = (result) => {
      for (const entry of result?.fileList || []) {
        if (entry?.tempFileURL) {
          applyEntry(entry.fileID, entry.tempFileURL);
          if (entry.fileID && fileIdToOriginals.has(entry.fileID)) {
            applyEntry(entry.fileID, entry.tempFileURL);
          }
        }
      }
      for (const entry of result?.fileList || []) {
        if (!entry?.tempFileURL || !entry?.fileID) continue;
        for (const [candidate, originals] of fileIdToOriginals.entries()) {
          if (entry.fileID === candidate || entry.fileID.endsWith(candidate.replace(/^cloud:\/\/[^/]+\//, ""))) {
            for (const original of originals) map.set(original, entry.tempFileURL);
          }
        }
      }
    };

    for (const client of clients) {
      if (typeof client?.getTempFileURL !== "function") continue;
      const missing = unique.filter((candidate) => {
        const originals = fileIdToOriginals.get(candidate) || new Set();
        return !(map.has(candidate) || [...originals].some((original) => map.has(original)));
      });
      if (!missing.length) break;
      try {
        ingestResult(await client.getTempFileURL({ fileList: missing }));
      } catch (error) {
        console.error("[storage] batch getTempFileURL failed:", error?.message || error);
      }
    }

    for (const [candidate, originals] of fileIdToOriginals.entries()) {
      const resolved = map.has(candidate) || [...originals].some((original) => map.has(original));
      if (resolved) continue;
      for (const client of clients) {
        if (typeof client?.getTempFileURL !== "function") continue;
        try {
          const result = await client.getTempFileURL({ fileList: [candidate] });
          const entry = result?.fileList?.[0];
          if (entry?.tempFileURL) {
            applyEntry(candidate, entry.tempFileURL);
            if (entry.fileID) applyEntry(entry.fileID, entry.tempFileURL);
            for (const original of originals) map.set(original, entry.tempFileURL);
            break;
          }
        } catch (error) {
          console.error("[storage] getTempFileURL fallback failed:", candidate, error?.message || error);
        }
      }
    }
    return map;
  };
  const resolveAdminPreviewUrl = async (rawPath) => {
    if (typeof rawPath !== "string" || !rawPath) return null;
    if (rawPath.startsWith("data:") || /^https?:\/\//i.test(rawPath)) return rawPath;
    const temp = await getTemporaryUrl(rawPath);
    if (temp && /^https?:\/\//i.test(temp)) return temp;
    const clients = storageClients();
    for (const fileId of toCloudFileCandidates(rawPath)) {
      for (const client of clients) {
        if (typeof client?.downloadFile !== "function") continue;
        try {
          const downloaded = await client.downloadFile({ fileID: fileId });
          const content = downloaded?.fileContent;
          if (!content) continue;
          const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
          // Match vision hard ceiling; previously 1.2MB skipped most phone food photos.
          if (buffer.length < 24 || buffer.length > 4 * 1024 * 1024) continue;
          const mime = buffer[0] === 0x89 && buffer[1] === 0x50
            ? "image/png"
            : buffer[0] === 0xff && buffer[1] === 0xd8
              ? "image/jpeg"
              : "image/jpeg";
          return `data:${mime};base64,${buffer.toString("base64")}`;
        } catch (error) {
          console.warn("[storage] admin preview download failed:", fileId, error?.message || error);
        }
      }
    }
    return temp || null;
  };
  const data = createProductDataService({ db, resolveAvatarUrl: getTemporaryUrl });
  const avatar = createProfileAvatarService({
    data,
    uploadImage: async ({ cloudPath, content, contentType }) => {
      // Legacy CloudBase Storage JWT auth is broken in this HTTP function runtime.
      // Skip cloud upload and let the avatar service persist an inline data URL instead
      // so we never overwrite default:food-N with an unresolvable storage ref.
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
  const generateMealInsightRaw = deepseekEnabled
    ? createDeepseekMealInsightService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
    : null;
  const generateMealInsight = generateMealInsightRaw
    ? async (input) => {
      const result = await generateMealInsightRaw(input);
      if (result && typeof result === "object" && result.usage) {
        recordModelUsage(opsRef.observability, {
          model: result.model || deepseekModel,
          feature: "meal_insight",
          provider: "deepseek",
          usage: result.usage,
          requests: 0,
        }).catch(() => {});
      }
      return result;
    }
    : null;
  const analyzeMealRaw = deepseekEnabled
    ? createDeepseekMealService({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel })
    : null;
  const analyzeMeal = analyzeMealRaw
    ? async (input) => {
      const result = await analyzeMealRaw(input);
      if (result?.usage) {
        recordModelUsage(opsRef.observability, {
          model: result.model || deepseekModel,
          feature: "meal_analysis",
          provider: "deepseek",
          usage: result.usage,
          requests: 0,
        }).catch(() => {});
      }
      return result;
    }
    : null;
  const milestones = createMilestoneStateService({ db });
  const meals = createMealDataService({
    db,
    model: deepseekModel,
    analyze: analyzeMeal,
    generateMealInsight,
    resolveImageUrl: getTemporaryUrl,
    getNutritionPlan: data.getNutritionPlan,
    onMealMutation: ({ userId, recordedAt }) => milestones.recalculateStreak(userId, {
      source: eventSourceForMutation(recordedAt),
    }),
  });
  const dailyInsightFactory = dependencies.dailyInsightFactory ?? createDailyInsightService;
  const dailyInsight = dailyInsightFactory({
    apiKey: env.DEEPSEEK_API_KEY,
    model: deepseekModel,
    source: "deepseek",
  });
  const weeklyReview = createDeepseekWeeklyReviewService({
    apiKey: env.DEEPSEEK_API_KEY,
    model: deepseekModel,
  });
  const insights = createInsightDataService({
    db,
    listMealsRange: meals.listMealsRange,
    countMeals: meals.countMeals,
    achievementState: createAchievementStateService({ db }),
    getProfileCompletion: async (userId) => {
      const profile = await db
        .from("profiles")
        .select("onboarding_completed_at")
        .eq("id", userId)
        .maybeSingle();
      if (profile.error) throw new Error("Achievement profile lookup failed");
      return {
        completed: Boolean(profile.data?.onboarding_completed_at),
        completedAt: profile.data?.onboarding_completed_at ?? null,
      };
    },
    getNutritionPlan: data.getNutritionPlan,
    weeklyReviewModel: deepseekModel,
    generateDailyInsight: async (input) => {
      const result = await dailyInsight(input);
      recordModelUsage(opsRef.observability, {
        model: result?.model,
        feature: "daily_insight",
        provider: result?.source === "deepseek" ? "deepseek" : result?.source || null,
        usage: result?.usage || null,
        requests: 0,
      }).catch(() => {});
      return result;
    },
    generateWeeklyReview: async (input) => {
      const result = await weeklyReview(input);
      recordModelUsage(opsRef.observability, {
        model: result?.model,
        feature: "weekly_review",
        provider: result?.source === "deepseek" ? "deepseek" : null,
        usage: result?.usage || null,
        requests: 0,
      }).catch(() => {});
      return result;
    },
  });
  const translateQueryRaw = createFoodQueryTranslator({ apiKey: env.DEEPSEEK_API_KEY, model: deepseekModel });
  const translateQuery = async (query) => {
    const result = await translateQueryRaw(query);
    if (result?.usage && result?.model) {
      recordModelUsage(opsRef.observability, {
        model: result.model,
        feature: "food_translate",
        provider: "deepseek",
        usage: result.usage,
        requests: 0,
      }).catch(() => {});
    }
    return result;
  };
  const foodCatalog = typeof env.USDA_FDC_API_KEY === "string" && env.USDA_FDC_API_KEY.trim()
    ? createFoodCatalogService({
      db,
      apiKey: env.USDA_FDC_API_KEY,
      translateQuery,
      mirrorImage: async (imageUrl, foodKey) => {
        const content = await downloadImageBuffer(imageUrl);
        if (!content.length || content.length > 2 * 1024 * 1024) throw new Error("Food image mirror failed");
        const cloudPath = `food-catalog/${String(foodKey).replace(/[^a-z0-9:_-]/gi, "-")}.jpg`;
        if (!admin || typeof admin.uploadFile !== "function") {
          throw new Error("Food image mirror storage is unavailable");
        }
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
    requestCompletion: nutritionContentWorker
      ? async (context) => {
        const result = await nutritionContentWorker.generateInsight(context);
        if (result?.model) {
          recordModelUsage(opsRef.observability, {
            model: result.model,
            feature: "food_insight",
            provider: "hunyuan",
            usage: result.usage || null,
            requests: 1,
          }).catch(() => {});
        }
        return result;
      }
      : null,
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
    loginAttemptTracker: createPersistentLoginAttemptTracker({ db }),
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
    resolveTempFileUrl: getTemporaryUrl,
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
  let assertImageSafe = null;
  try {
    require("sharp");
    console.info("[vision] sharp available for storage + WeChat img_sec_check compress");
  } catch (sharpLoadError) {
    console.error(
      "[vision] sharp missing — uploads over ~900KB will fail img_sec_check:",
      sharpLoadError?.message || sharpLoadError,
    );
  }
  try {
    if (env.WX_APPID && env.WX_SECRET) {
      assertImageSafe = createWechatImageSecurity({
        appId: env.WX_APPID,
        appSecret: env.WX_SECRET,
      }).assertImageAllowed;
    }
  } catch (securityInitError) {
    console.warn("[vision] image security init failed:", securityInitError?.message || securityInitError);
  }
  const uploadVisionImage = async ({ cloudPath, content, contentType }) => {
    const toDataUrl = () => {
      const mime = contentType || "image/jpeg";
      return `data:${mime};base64,${content.toString("base64")}`;
    };
    // Same dual-client pattern as food-library uploads: ambient SCF identity first,
    // API-key admin client only as fallback (API-key storage JWT is unreliable here).
    const clients = [storageRuntime, admin].filter(Boolean);
    const uploadOnce = async () => {
      let lastError = null;
      for (const client of clients) {
        if (typeof client?.uploadFile !== "function") continue;
        try {
          const result = await client.uploadFile({ cloudPath, fileContent: content });
          const fileID = result?.fileID;
          if (!fileID) throw new Error("Vision upload failed");
          let imageUrl = null;
          try {
            imageUrl = await getTemporaryUrl(fileID);
          } catch (tempErr) {
            console.warn("[vision] getTempFileURL after upload failed:", tempErr?.message || tempErr);
          }
          void contentType;
          return { cloudPath: fileID, imageUrl: imageUrl || toDataUrl() };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError || new Error("Vision upload failed");
    };
    try {
      return await Promise.race([
        uploadOnce(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Vision upload timed out")), 25_000)),
      ]);
    } catch (uploadErr) {
      console.error("[vision] Storage upload failed, retrying once:", uploadErr?.message || uploadErr);
      try {
        return await uploadOnce();
      } catch (retryErr) {
        console.error("[vision] Storage retry failed, analyzing via data URL only:", retryErr?.message || retryErr);
        // Do NOT invent cloud://env/path — that is not a valid fileID and breaks admin/meal previews.
        return { cloudPath: null, imageUrl: toDataUrl() };
      }
    }
  };
  const uploadBlockedImage = async ({ userId, content, contentType }) => {
    const extension = contentType === "image/png" ? "png" : contentType === "image/gif" ? "gif" : "jpg";
    const cloudPath = `vision-blocked/${userId}/${crypto.randomUUID()}.${extension}`;
    const clients = [storageRuntime, admin].filter(Boolean);
    let lastError = null;
    for (const client of clients) {
      if (typeof client?.uploadFile !== "function") continue;
      try {
        const result = await client.uploadFile({ cloudPath, fileContent: content });
        if (!result?.fileID) throw new Error("Blocked vision upload failed");
        return { cloudPath: result.fileID };
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError || new Error("Blocked vision upload failed");
  };
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
      assertImageSafe,
      uploadBlockedImage,
      uploadImage: uploadVisionImage,
    });
  } else if (typeof env.VITA_API_KEY === "string" && env.VITA_API_KEY) {
    vision = createVisionDataService({
      db,
      model: env.VITA_MODEL,
      analyze: createVitaVisionService({ apiKey: env.VITA_API_KEY, model: env.VITA_MODEL }),
      evaluateMeal,
      backfillNutrition,
      assertImageSafe,
      uploadBlockedImage,
      uploadImage: uploadVisionImage,
    });
  }
  // Old-image auditing is deliberately Qwen-only: it needs strict visual JSON
  // output and its credentials stay entirely in this server runtime.
  const foodImageAudit = typeof qwenApiKey === "string" && qwenApiKey.trim()
    ? createFoodImageAuditService({
      db,
      repository: foodRepository,
      auditVision: createFoodImageAuditVision({
        apiKey: qwenApiKey,
        workspaceId: env.QWEN_WORKSPACE_ID || "llm-ekun6ter25w7d0ms",
        model: env.QWEN_VL_FLASH_MODEL || "qwen3-vl-flash",
      }),
      jobs: foodImageJobs,
      requireAdmin: allowAdminConsole,
    })
    : null;
  const operationGuard = typeof db?.from === "function" ? createOperationGuard({ db }) : null;
  const observability = createObservabilityService({ db });
  opsRef.observability = observability;
  const contentModeration = createContentModerationService({ db });
  const visionImageReview = createVisionImageReviewService({
    db,
    resolveTempFileUrls,
  });
  const deleteStorageCloudFiles = async ({ cloudPaths, label = "storage" } = {}) => {
    const paths = Array.isArray(cloudPaths) ? cloudPaths.filter(Boolean) : [];
    if (!paths.length) return { deleted: 0, attempted: 0 };
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
            const msg = String(error?.message || error || "");
            // Missing object is fine for admin / retention cleanup of orphan DB refs.
            if (/STORAGE_FILE_NONEXIST|FILE_NOT_EXIST|STORAGE_NOT_EXIST|not\s*found|不存在/i.test(msg)) {
              ok = true;
              break;
            }
          }
        }
        if (ok) break;
      }
      if (ok) deleted += 1;
    }
    if (deleted < paths.length && lastError) {
      console.error(`[${label}] deleteFile incomplete:`, lastError?.message || lastError);
      throw lastError;
    }
    return { deleted, attempted: paths.length };
  };
  const deleteVisionCloudFiles = async ({ cloudPaths }) =>
    deleteStorageCloudFiles({ cloudPaths, label: "vision-storage" });
  const visionImageRetention = createVisionImageRetentionService({
    db,
    deleteFiles: deleteVisionCloudFiles,
  });
  const userImageOps = typeof db?.from === "function"
    ? createUserImageOpsService({
      db,
      resolveTempFileUrls,
      resolveOneUrl: resolveAdminPreviewUrl,
      deleteFiles: deleteVisionCloudFiles,
    })
    : null;
  const accountDeletion = createAccountDeletionService({
    db,
    operationGuard,
    deleteFiles: async ({ cloudPaths }) => {
      await deleteStorageCloudFiles({ cloudPaths, label: "account-cancellation" });
    },
    onStorageCleanupFailed: async ({ userId, clientRequestId, pathCount, reason }) => {
      console.error("[account-cancellation] storage cleanup skipped:", { userId, clientRequestId, pathCount, reason });
      await observability?.recordMetric?.("account_storage_cleanup_skipped", 1, {
        userId,
        clientRequestId,
        pathCount,
        reason: String(reason || "").slice(0, 200),
      });
    },
  });
  const productUserExists = createProductUserExists(db);

  return {
    issue: session.issue,
    verifySession: (token) => verifyAccessToken(token, config.sessionSecret),
    productUserExists,
    data,
    meals,
    milestones,
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
      proactiveDailyBrief: createProactiveDailyBriefService({
        apiKey: env.DEEPSEEK_API_KEY,
        model: deepseekModel,
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
    foodImageAudit,
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
    operationGuard,
    observability,
    contentModeration,
    visionImageReview,
    visionImageRetention,
    userImageOps,
    vision,
    modelCatalog: buildModelCatalog({
      env,
      vision,
      hunyuanModel: hunyuanImageService?.modelName || env.HY_IMAGE_MODEL || "HY-Image-3.0-Plus-4090-Tob-v1.0",
      deepseekModel,
    }),
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

async function authorizeProductRequest(service, req, res) {
  const resolved = await resolveProductSession(service, readBearerToken(req));
  if (resolved.error) {
    sendJson(res, resolved.error.status, resolved.error.body);
    return null;
  }
  return resolved.session;
}

function getDataOperation(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  return ({
    "/profile": "saveProfile",
    "/body-profile": "saveBodyProfile",
    "/goal": "saveGoal",
    "/onboarding": "saveOnboarding",
    "/onboarding-draft": "saveOnboardingDraft",
    "/account": "getAccount",
    "/account/cancel": "cancelAccount",
    "/account/usage": "accountUsage",
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
    "/milestone-stats": "getMilestoneStats",
    "/achievements": "getAchievements",
  })[path] ?? null;
}

function getAchievementCelebrationRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/achievements/evaluate") return { operation: "evaluate" };
  const match = path.match(/^\/achievements\/([a-z0-9_-]{1,80})\/celebrate$/i);
  return match ? { operation: "acknowledge", achievementId: match[1] } : null;
}

function getMilestoneRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/milestone-journey" || path === "/milestone-journey/current") return { operation: "journey" };
  if (path === "/milestones/claim-pending") return { operation: "claim" };
  let match = path.match(/^\/milestone-events\/([0-9a-f-]{36})$/i);
  if (match) return { operation: "event", eventId: match[1] };
  match = path.match(/^\/milestones\/([0-9a-f-]{36})\/(present|share)$/i);
  return match ? { operation: match[2], eventId: match[1] } : null;
}

function getCoachRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/coach/messages") return "getMessages";
  if (path === "/coach/brief") return "getBrief";
  if (path === "/coach-answer") return "sendMessage";
  if (path === "/coach-answer/stream") return "streamMessage";
  if (path === "/coach/restart") return "restartConversation";
  if (path === "/coach/daily-tip") return "getDailyTip";
  if (path === "/coach/daily-brief") return "getDailyBrief";
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
  if (path === "/ops/overview") return { operation: "opsOverview" };
  if (path === "/ops/quota") return { operation: "opsQuota" };
  if (path === "/ops/quota/model") return { operation: "opsQuotaModel" };
  if (path === "/ops/deletion-log") return { operation: "opsDeletionLog" };
  if (path === "/ops/moderation-flags") return { operation: "opsModerationFlags" };
  if (path === "/ops/moderation-dashboard") return { operation: "opsModerationDashboard" };
  if (path === "/ops/vision-images") return { operation: "opsVisionImages" };
  if (path === "/ops/vision-images/purge") return { operation: "opsVisionImagesPurge" };
  if (path === "/ops/user-images") return { operation: "opsUserImages" };
  const userImageItemMatch = path.match(/^\/ops\/user-images\/(vision|blocked|avatar|asset)\/([0-9a-f-]{36})$/i);
  if (userImageItemMatch) {
    return { operation: "opsUserImageItem", kind: userImageItemMatch[1].toLowerCase(), itemId: userImageItemMatch[2] };
  }
  const visionAnalysisReviewMatch = path.match(/^\/ops\/vision-images\/([0-9a-f-]{36})$/i);
  if (visionAnalysisReviewMatch) return { operation: "opsVisionImageItem", analysisId: visionAnalysisReviewMatch[1] };
  const moderationFlagMatch = path.match(/^\/ops\/moderation-flags\/([0-9a-f-]{36})$/i);
  if (moderationFlagMatch) return { operation: "opsModerationFlagItem", flagId: moderationFlagMatch[1] };
  if (path === "/feedback") return { operation: "listFeedback" };
  const feedbackMatch = path.match(/^\/feedback\/([0-9a-f-]{36})$/i);
  if (feedbackMatch) return { operation: "patchFeedback", feedbackId: feedbackMatch[1] };
  if (path === "/foods/missing-images") return { operation: "missingImages" };
  if (path === "/foods/sync-jobs") return { operation: "syncJobs" };
  if (path === "/food-image-audits/preview") return { operation: "imageAuditPreview" };
  const auditReviewMatch = path.match(/^\/food-image-audits\/([0-9a-f-]{36})\/review$/i);
  if (auditReviewMatch) return { operation: "imageAuditReview", runId: auditReviewMatch[1] };
  const auditRunMatch = path.match(/^\/food-image-audits\/([0-9a-f-]{36})$/i);
  if (auditRunMatch) return { operation: "imageAuditRun", runId: auditRunMatch[1] };
  const auditKeepMatch = path.match(/^\/food-image-audit-items\/([0-9a-f-]{36})\/keep$/i);
  if (auditKeepMatch) return { operation: "imageAuditKeep", itemId: auditKeepMatch[1] };
  const auditRegenerateMatch = path.match(/^\/food-image-audit-items\/([0-9a-f-]{36})\/regenerate$/i);
  if (auditRegenerateMatch) return { operation: "imageAuditRegenerate", itemId: auditRegenerateMatch[1] };
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

function clampFoodImageAuditPreviewCount(value) {
  const count = Number(value);
  if (!Number.isFinite(count) || count <= 20) return 20;
  if (count <= 50) return 50;
  return 100;
}

function clampFoodImageAuditItemIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((itemId) => typeof itemId === "string" && itemId.trim())
    .map((itemId) => itemId.trim()))].slice(0, 100);
}

function getInternalFoodImageRoute(pathname) {
  const path = normalizeFoodImageDispatchPath(pathname);
  if (path === "/api/internal/food-image-batches/dispatch") return { operation: "dispatchImageBatches" };
  if (path === "/api/internal/vision-images/purge") return { operation: "purgeVisionImages" };
  return null;
}

function normalizeFoodImageDispatchPath(pathname) {
  return String(pathname || "").replace(/^\/get-login-ticket/, "");
}

function getFeedbackRoute(pathname) {
  const path = pathname.replace(/^\/get-login-ticket/, "");
  if (path === "/feedback") return { operation: "feedback" };
  if (path === "/feedback/read") return { operation: "markRepliesRead" };
  return null;
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
    const achievementCelebrationRoute = getAchievementCelebrationRoute(url.pathname);
    const milestoneRoute = getMilestoneRoute(url.pathname);
    const coachOperation = getCoachRoute(url.pathname);
    const foodRoute = getFoodRoute(url.pathname);
    const adminFoodRoute = getAdminFoodRoute(url.pathname);
    const internalFoodImageRoute = getInternalFoodImageRoute(url.pathname);
    const feedbackRoute = getFeedbackRoute(url.pathname);
    const visionRoute = isVisionRoute(url.pathname);
    const avatarRoute = isAvatarRoute(url.pathname);
    if (url.pathname !== "/" && url.pathname !== "/get-login-ticket" && !dataOperation && !mealRoute && !insightOperation && !achievementCelebrationRoute && !milestoneRoute && !coachOperation && !foodRoute && !adminFoodRoute && !internalFoodImageRoute && !feedbackRoute && !visionRoute && !avatarRoute) {
      sendJson(res, 404, { code: "NOT_FOUND" });
      return;
    }
    if (internalFoodImageRoute) {
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        const payload = await readRawJsonBody(req);
        if (!verifyFoodImageDispatchSignature(service?.foodImageDispatchSecret, req, {
          path: normalizeFoodImageDispatchPath(url.pathname),
          body: payload.raw,
        })) return sendJson(res, 401, { code: "UNAUTHORIZED" });
        if (internalFoodImageRoute.operation === "purgeVisionImages") {
          if (!service?.visionImageRetention?.purgeExpiredVisionImages) {
            return sendJson(res, 503, { code: "VISION_PURGE_UNAVAILABLE" });
          }
          const result = await service.visionImageRetention.purgeExpiredVisionImages({
            limit: payload.body?.limit,
          });
          let deletionAudit = null;
          if (payload.body?.purgeDeletionAudit) {
            if (typeof service.observability?.purgeExpiredDeletionLogs !== "function") {
              return sendJson(res, 503, { code: "DELETION_AUDIT_PURGE_UNAVAILABLE" });
            }
            deletionAudit = await service.observability.purgeExpiredDeletionLogs();
          }
          service.observability?.recordMetric?.("vision_purge_deleted", result.deleted || 0, {
            feature: "vision_retention",
          }).catch(() => {});
          service.observability?.recordMetric?.("vision_purge_failed", result.failed || 0, {
            feature: "vision_retention",
          }).catch(() => {});
          return sendJson(res, 200, { ...result, deletionAudit });
        }
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
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.avatar?.upload) return sendJson(res, 401, { code: "UNAUTHORIZED" });
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
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
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
          const categoryParam = url.searchParams.get("category") || "";
          const categoryCodes = categoryParam.split(",").map((item) => item.trim()).filter(Boolean);
          const tagsParam = url.searchParams.get("tags") || "";
          const tagCodes = tagsParam.split(",").map((item) => item.trim()).filter(Boolean);
          return sendJson(res, 200, mapRepositoryCatalogResult(await service.foodRepository.listFoods({
            q: query,
            categoryCodes,
            tagCodes,
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
        if (adminFoodRoute.operation === "opsOverview") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.observability?.getOverview) return sendJson(res, 503, { code: "OPS_OVERVIEW_UNAVAILABLE" });
          const hours = Number(url.searchParams.get("hours") ?? "24");
          const overview = await service.observability.getOverview({ hours });
          if (service.foodImageJobs?.getStats) {
            try {
              overview.foodImage = await service.foodImageJobs.getStats(session.sub);
            } catch (error) {
              console.warn("[ops-overview] food image stats unavailable:", error?.message || error);
            }
          }
          return sendJson(res, 200, overview);
        }
        if (adminFoodRoute.operation === "opsQuota") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.observability?.getUsageReport) return sendJson(res, 503, { code: "OPS_QUOTA_UNAVAILABLE" });
          const days = Number(url.searchParams.get("days") ?? "14");
          const hours = Number(url.searchParams.get("hours") ?? "24");
          const [usage, overview] = await Promise.all([
            service.observability.getUsageReport({ days }),
            service.observability.getOverview({ hours }),
          ]);
          let foodImage = null;
          let foodImageQuota = null;
          let foodImageSeries = [];
          if (service.foodImageJobs?.getStats) {
            try {
              foodImage = await service.foodImageJobs.getStats(session.sub);
            } catch (error) {
              console.warn("[ops-quota] food image stats unavailable:", error?.message || error);
            }
          }
          if (service.foodImagePatrol?.remainingQuota) {
            try {
              foodImageQuota = await service.foodImagePatrol.remainingQuota(session.sub);
            } catch (error) {
              console.warn("[ops-quota] food image patrol quota unavailable:", error?.message || error);
            }
          }
          if (service.foodImageJobs?.listDailyUsage) {
            try {
              foodImageSeries = await service.foodImageJobs.listDailyUsage({ days });
            } catch (error) {
              console.warn("[ops-quota] food image series unavailable:", error?.message || error);
            }
          }
          const foodToday = foodImageQuota?.usage ?? foodImage?.dailyGenerated ?? 0;
          const foodTotal = foodImageSeries.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
          const catalog = service.modelCatalog || buildModelCatalog({ env: process.env, vision: service.vision });
          let modelBoard = { models: [] };
          if (service.observability?.getModelBoard) {
            try {
              modelBoard = await service.observability.getModelBoard({
                days,
                catalog,
                foodImageSeries,
              });
            } catch (error) {
              console.warn("[ops-quota] model board unavailable:", error?.message || error);
            }
          }
          return sendJson(res, 200, {
            windowHours: overview.windowHours,
            models: catalog,
            modelBoard,
            limits: {
              visionDaily: VISION_EFFECTIVE_DAILY_LIMIT,
              visionBurst: VISION_BURST_LIMIT,
              visionBurstWindowSeconds: VISION_BURST_WINDOW_SECONDS,
              coachDaily: COACH_DAILY_MESSAGE_LIMIT,
              foodImageDaily: Number(process.env.HY_IMAGE_DAILY_LIMIT) || service.foodImageJobs?.dailyLimit || 500,
            },
            metrics: {
              rateLimited: overview.rateLimited ?? 0,
              visionSuccess: overview.vision?.success ?? 0,
              visionFailure: overview.vision?.failure ?? 0,
              coachMessages: overview.coach?.messages ?? 0,
              coachLimited: overview.coach?.limited ?? 0,
            },
            usage,
            foodImage,
            foodImageQuota,
            foodImageUsage: {
              today: foodToday,
              windowTotal: foodTotal,
              dailyLimit: foodImageQuota?.limit ?? foodImage?.dailyLimit ?? null,
              remaining: foodImageQuota?.remaining ?? null,
              series: foodImageSeries,
            },
          });
        }
        if (adminFoodRoute.operation === "opsQuotaModel") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.observability?.getModelDetail) return sendJson(res, 503, { code: "OPS_QUOTA_UNAVAILABLE" });
          const model = url.searchParams.get("model");
          if (!model) return sendJson(res, 400, { code: "MODEL_REQUIRED", message: "缺少 model 参数" });
          const days = Number(url.searchParams.get("days") ?? "30");
          let foodImageSeries = [];
          if (service.foodImageJobs?.listDailyUsage) {
            try {
              foodImageSeries = await service.foodImageJobs.listDailyUsage({ days });
            } catch (error) {
              console.warn("[ops-quota-model] food image series unavailable:", error?.message || error);
            }
          }
          return sendJson(res, 200, await service.observability.getModelDetail({
            model,
            days,
            catalog: service.modelCatalog || buildModelCatalog({ env: process.env, vision: service.vision }),
            foodImageSeries,
          }));
        }
        if (adminFoodRoute.operation === "opsDeletionLog") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.observability?.listDeletionLog) return sendJson(res, 503, { code: "OPS_DELETION_LOG_UNAVAILABLE" });
          return sendJson(res, 200, {
            items: await service.observability.listDeletionLog({
              limit: url.searchParams.get("limit"),
            }),
          });
        }
        if (adminFoodRoute.operation === "opsModerationFlags") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.contentModeration?.listFlags) return sendJson(res, 503, { code: "OPS_MODERATION_UNAVAILABLE" });
          const statusParam = url.searchParams.get("status");
          const status = statusParam === null || statusParam === "all" ? "" : (statusParam || "open");
          return sendJson(res, 200, {
            items: await service.contentModeration.listFlags({
              status,
              limit: url.searchParams.get("limit"),
            }),
          });
        }
        if (adminFoodRoute.operation === "opsModerationDashboard") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.contentModeration?.getDashboard) return sendJson(res, 503, { code: "OPS_MODERATION_UNAVAILABLE" });
          const statusParam = url.searchParams.get("status");
          return sendJson(res, 200, await service.contentModeration.getDashboard({
            days: Number(url.searchParams.get("days") ?? "14"),
            status: statusParam === null ? "open" : statusParam,
            limit: url.searchParams.get("limit") || 100,
          }));
        }
        if (adminFoodRoute.operation === "opsModerationFlagItem") {
          if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.contentModeration?.updateFlagStatus) return sendJson(res, 503, { code: "OPS_MODERATION_UNAVAILABLE" });
          const body = await readJsonBody(req);
          return sendJson(res, 200, await service.contentModeration.updateFlagStatus(adminFoodRoute.flagId, body?.status));
        }
        if (adminFoodRoute.operation === "opsVisionImages") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.visionImageReview) return sendJson(res, 503, { code: "OPS_VISION_REVIEW_UNAVAILABLE" });
          const tab = String(url.searchParams.get("tab") || "blocked");
          const limit = Number(url.searchParams.get("limit") || 40);
          const status = String(url.searchParams.get("status") || "open");
          if (tab === "all") {
            return sendJson(res, 200, {
              tab: "all",
              items: await service.visionImageReview.listAll({ limit, days: 14 }),
            });
          }
          return sendJson(res, 200, {
            tab: "blocked",
            items: await service.visionImageReview.listBlocked({ status, limit }),
          });
        }
        if (adminFoodRoute.operation === "opsUserImages") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.userImageOps?.list) return sendJson(res, 503, { code: "OPS_USER_IMAGES_UNAVAILABLE" });
          try {
            return sendJson(res, 200, await service.userImageOps.list({
              kind: url.searchParams.get("kind") || "all",
              userId: url.searchParams.get("userId") || undefined,
              page: Number(url.searchParams.get("page") || 1),
              pageSize: Number(url.searchParams.get("pageSize") || 40),
              status: url.searchParams.get("status") || "all",
            }));
          } catch (error) {
            if (error instanceof PublicUserImageError) {
              return sendJson(res, 400, { code: error.code, message: error.message });
            }
            console.error("[ops/user-images] list failed:", error?.message || error);
            return sendJson(res, 503, {
              code: "OPS_USER_IMAGES_FAILED",
              message: error?.message || "用户图片列表加载失败",
            });
          }
        }
        if (adminFoodRoute.operation === "opsUserImageItem") {
          if (req.method !== "DELETE") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.userImageOps?.delete) return sendJson(res, 503, { code: "OPS_USER_IMAGES_UNAVAILABLE" });
          try {
            return sendJson(res, 200, await service.userImageOps.delete({
              kind: adminFoodRoute.kind,
              id: adminFoodRoute.itemId,
            }));
          } catch (error) {
            if (error instanceof PublicUserImageError) {
              const statusCode = error.code === "USER_IMAGE_NOT_FOUND" ? 404 : 400;
              return sendJson(res, statusCode, { code: error.code, message: error.message });
            }
            console.error("[ops/user-images] delete failed:", error?.message || error);
            return sendJson(res, 503, {
              code: "OPS_USER_IMAGES_FAILED",
              message: error?.message || "用户图片删除失败",
            });
          }
        }
        if (adminFoodRoute.operation === "opsVisionImagesPurge") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.visionImageRetention?.purgeExpiredVisionImages) {
            return sendJson(res, 503, { code: "VISION_PURGE_UNAVAILABLE" });
          }
          const body = await readJsonBody(req);
          const result = await service.visionImageRetention.purgeExpiredVisionImages({ limit: body?.limit });
          service.observability?.recordMetric?.("vision_purge_deleted", result.deleted || 0, {
            feature: "vision_retention",
            actor: session.sub,
          }).catch(() => {});
          return sendJson(res, 200, result);
        }
        if (adminFoodRoute.operation === "opsVisionImageItem") {
          if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.visionImageReview?.updateAnalysisReview) {
            return sendJson(res, 503, { code: "OPS_VISION_REVIEW_UNAVAILABLE" });
          }
          const body = await readJsonBody(req);
          return sendJson(res, 200, await service.visionImageReview.updateAnalysisReview(
            adminFoodRoute.analysisId,
            body?.reviewStatus || body?.status,
          ));
        }
        if (adminFoodRoute.operation === "patchFeedback") {
          if (req.method !== "PATCH") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.adminConsole) return sendJson(res, 503, { code: "FOOD_ADMIN_UNAVAILABLE" });
          const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
          return sendJson(res, 200, await service.adminConsole.updateFeedback(session.sub, adminFoodRoute.feedbackId, body || {}));
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
        if (adminFoodRoute.operation === "imageAuditPreview") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImageAudit?.previewHighRisk) return sendJson(res, 503, { code: "FOOD_IMAGE_AUDIT_UNAVAILABLE" });
          const body = await readJsonBody(req, 16 * 1024);
          return sendJson(res, 200, await service.foodImageAudit.previewHighRisk(session.sub, {
            count: clampFoodImageAuditPreviewCount(body?.count),
          }));
        }
        if (adminFoodRoute.operation === "imageAuditRun") {
          if (req.method !== "GET") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImageAudit?.listRun) return sendJson(res, 503, { code: "FOOD_IMAGE_AUDIT_UNAVAILABLE" });
          return sendJson(res, 200, await service.foodImageAudit.listRun(session.sub, adminFoodRoute.runId));
        }
        if (adminFoodRoute.operation === "imageAuditReview") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImageAudit?.reviewItems) return sendJson(res, 503, { code: "FOOD_IMAGE_AUDIT_UNAVAILABLE" });
          const body = await readJsonBody(req, 16 * 1024);
          return sendJson(res, 200, await service.foodImageAudit.reviewItems(session.sub, adminFoodRoute.runId, {
            itemIds: clampFoodImageAuditItemIds(body?.itemIds),
          }));
        }
        if (adminFoodRoute.operation === "imageAuditKeep") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImageAudit?.keepItem) return sendJson(res, 503, { code: "FOOD_IMAGE_AUDIT_UNAVAILABLE" });
          return sendJson(res, 200, await service.foodImageAudit.keepItem(session.sub, adminFoodRoute.itemId));
        }
        if (adminFoodRoute.operation === "imageAuditRegenerate") {
          if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
          if (!service.foodImageAudit?.requestRegeneration) return sendJson(res, 503, { code: "FOOD_IMAGE_AUDIT_UNAVAILABLE" });
          const body = await readJsonBody(req, 16 * 1024);
          return sendJson(res, 200, await service.foodImageAudit.requestRegeneration(session.sub, adminFoodRoute.itemId, {
            visualType: body?.visualType,
          }));
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
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.meals) return sendJson(res, 401, { code: "UNAUTHORIZED" });
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
    if (milestoneRoute) {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.milestones) return sendJson(res, 503, { code: "MILESTONE_SERVICE_UNAVAILABLE" });
      try {
        if (milestoneRoute.operation === "journey" && req.method === "GET") return sendJson(res, 200, await service.milestones.getCurrentJourney(session.sub));
        if (milestoneRoute.operation === "claim" && req.method === "POST") return sendJson(res, 200, { event: await service.milestones.claimPendingMilestone(session.sub) });
        if (milestoneRoute.operation === "event" && req.method === "GET") return sendJson(res, 200, await service.milestones.getPresentedEvent(session.sub, milestoneRoute.eventId));
        if (milestoneRoute.operation === "present" && req.method === "POST") {
          const body = await readJsonBody(req, 32 * 1024);
          if (typeof body?.claimToken !== "string") return sendJson(res, 400, { code: "MILESTONE_CLAIM_INVALID" });
          return sendJson(res, 200, { snapshot: await service.milestones.confirmMilestonePresented(session.sub, milestoneRoute.eventId, body.claimToken) });
        }
        if (milestoneRoute.operation === "share" && req.method === "POST") return sendJson(res, 200, await service.milestones.recordShare(session.sub, milestoneRoute.eventId));
        return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      } catch (error) {
        const message = error?.message || "MILESTONE_SERVICE_UNAVAILABLE";
        const status = /not found|unavailable/i.test(message) ? 404 : /claim/i.test(message) ? 409 : 503;
        return sendJson(res, status, { code: status === 409 ? "MILESTONE_CLAIM_INVALID" : "MILESTONE_SERVICE_UNAVAILABLE", message });
      }
    }
    if (achievementCelebrationRoute && req.method === "POST") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.insights?.getAchievements || !service.insights?.acknowledgeAchievementCelebration) {
        return sendJson(res, 503, { code: "ACHIEVEMENT_SERVICE_UNAVAILABLE" });
      }
      try {
        if (achievementCelebrationRoute.operation === "evaluate") {
          const body = await readJsonBody(req, 16 * 1024);
          const date = typeof body?.date === "string" ? body.date : "";
          if (!date) return sendJson(res, 400, { code: "INSIGHT_DATA_INVALID", message: "缺少日期参数" });
          const achievements = await service.insights.getAchievements(session.sub, date);
          return sendJson(res, 200, {
            achievements,
            newlyUnlocked: achievements.filter((item) => item.justUnlocked === true),
          });
        }
        await service.insights.acknowledgeAchievementCelebration(session.sub, achievementCelebrationRoute.achievementId);
        return sendJson(res, 200, { acknowledged: true });
      } catch (error) {
        console.error("[achievement-celebration] failed:", error?.message || error);
        return sendJson(res, 503, { code: "ACHIEVEMENT_SERVICE_UNAVAILABLE" });
      }
    }
    if (insightOperation && req.method === "GET") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.insights?.[insightOperation]) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      const date = url.searchParams.get("date");
      if (!date) return sendJson(res, 400, { code: "INSIGHT_DATA_INVALID", message: "缺少日期参数" });
      try {
        const preferFast = url.searchParams.get("preferFast") === "1";
        if (insightOperation === "getDailySummaryWithInsight") {
          // Home / meal-records: never block the summary on LLM; upgrade cache in background.
          const light = url.searchParams.get("light") === "1";
          return sendJson(res, 200, await service.insights.getDailySummaryWithInsight(session.sub, date, {
            preferFast: true,
            resolveImages: !light,
          }));
        }
        if (insightOperation === "getWeeklyReview") {
          return sendJson(res, 200, await service.insights.getWeeklyReview(session.sub, date, { preferFast }));
        }
        if (insightOperation === "getMilestoneStats") {
          const milestone = Number(url.searchParams.get("milestone"));
          return sendJson(res, 200, await service.insights.getMilestoneStats(session.sub, milestone, date));
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
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.coach?.[coachOperation]) return sendJson(res, 401, { code: "UNAUTHORIZED" });
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
          const tip = await service.coach.getDailyTip(session.sub, date, { refresh });
          if (!tip?.cached && tip?.model && tip?.source && tip.source !== "rule_v2") {
            recordModelUsage(service.observability, {
              model: tip.model,
              feature: "daily_tip",
              provider: tip.source === "deepseek" ? "deepseek" : tip.source === "hunyuan-exp" ? "hunyuan" : tip.source || null,
              usage: tip.usage || null,
              requests: 1,
            }).catch(() => {});
          }
          return sendJson(res, 200, tip);
        }
        if (coachOperation === "getDailyBrief" && req.method === "GET") {
          const date = url.searchParams.get("date");
          if (!date) return sendJson(res, 400, { code: "COACH_INPUT_INVALID" });
          const brief = await service.coach.getDailyBrief(session.sub, date);
          if (!brief?.cached && brief?.model && brief?.source === "deepseek") {
            recordModelUsage(service.observability, {
              model: brief.model,
              feature: "proactive_daily_brief",
              provider: "deepseek",
              usage: brief.usage || null,
              requests: 1,
            }).catch(() => {});
          }
          return sendJson(res, 200, brief);
        }
        if (coachOperation === "restartConversation" && req.method === "POST") {
          return sendJson(res, 200, await service.coach.restartConversation(session.sub));
        }
        if (coachOperation === "sendMessage" && req.method === "POST") {
          const body = await readJsonBody(req);
          try {
            service.contentModeration?.assertTextAllowed?.(body?.prompt, { source: "coach" });
          } catch (error) {
            if (error instanceof PublicContentModerationError) {
              const matchedTerm = service.contentModeration?.findBannedContentTerm?.(body?.prompt);
              if (matchedTerm) {
                service.contentModeration.flagViolation({
                  userId: session.sub,
                  source: "coach",
                  snippet: body?.prompt,
                  matchedTerm,
                }).catch((flagError) => {
                  console.warn("[content-moderation] coach flag failed:", flagError?.message || flagError);
                });
              }
              return sendJson(res, 400, { code: error.code, message: error.message });
            }
            throw error;
          }
          const result = await service.coach.sendMessage(session.sub, body);
          const coachModel = result?.model
            || service.modelCatalog?.find((item) => item.feature === "coach")?.model
            || null;
          service.observability?.recordMetric?.("coach_message", 1, {
            userId: session.sub,
            feature: "coach",
            model: coachModel,
          }).catch(() => {});
          recordModelUsage(service.observability, {
            model: coachModel,
            feature: "coach",
            provider: "deepseek",
            usage: result?.usage || null,
            requests: 0,
          }).catch(() => {});
          return sendJson(res, 200, result);
        }
        if (coachOperation === "streamMessage" && req.method === "POST") {
          const body = await readJsonBody(req);
          try {
            service.contentModeration?.assertTextAllowed?.(body?.prompt, { source: "coach" });
          } catch (error) {
            if (error instanceof PublicContentModerationError) {
              const matchedTerm = service.contentModeration?.findBannedContentTerm?.(body?.prompt);
              if (matchedTerm) {
                service.contentModeration.flagViolation({
                  userId: session.sub,
                  source: "coach",
                  snippet: body?.prompt,
                  matchedTerm,
                }).catch((flagError) => {
                  console.warn("[content-moderation] coach flag failed:", flagError?.message || flagError);
                });
              }
              return sendJson(res, 400, { code: error.code, message: error.message });
            }
            throw error;
          }
          res.writeHead(200, {
            "Content-Type": "application/x-ndjson; charset=utf-8",
            "Cache-Control": "no-cache",
            ...CORS_HEADERS,
          });
          try {
            for await (const event of service.coach.streamMessage(session.sub, body)) {
              if (event?.type === "complete") {
                const coachModel = event?.model
                  || service.modelCatalog?.find((item) => item.feature === "coach")?.model
                  || null;
                service.observability?.recordMetric?.("coach_message", 1, {
                  userId: session.sub,
                  feature: "coach",
                  model: coachModel,
                }).catch(() => {});
                recordModelUsage(service.observability, {
                  model: coachModel,
                  feature: "coach",
                  provider: "deepseek",
                  usage: event?.usage || null,
                  requests: 0,
                }).catch(() => {});
              }
              res.write(`${JSON.stringify(event)}\n`);
            }
          } catch (error) {
            const code = error instanceof PublicCoachDataError || typeof error?.code === "string" ? error.code : "COACH_SERVICE_UNAVAILABLE";
            const message = error instanceof PublicCoachDataError ? error.message : undefined;
            res.write(`${JSON.stringify({ type: "error", code, ...(message ? { message } : {}) })}\n`);
          }
          res.end();
          return;
        }
        return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      } catch (error) {
        if (error instanceof PublicCoachDataError) {
          if (error.code === "COACH_DAILY_LIMIT_REACHED") {
            service.observability?.recordMetric?.("coach_limited", 1, {
              userId: session.sub,
              feature: "coach",
              model: service.modelCatalog?.find((item) => item.feature === "coach")?.model || null,
            }).catch(() => {});
          }
          const status = error.code === "SESSION_USER_MISSING" ? 401 : error.code === "COACH_DAILY_LIMIT_REACHED" ? 429 : 400;
          return sendJson(res, status, { code: error.code, message: error.message });
        }
        console.error("[coach] failed:", error?.message || error);
        return sendJson(res, 503, { code: "COACH_SERVICE_UNAVAILABLE", message: error?.message || "COACH_SERVICE_UNAVAILABLE" });
      }
    }
    if (feedbackRoute) {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (feedbackRoute.operation === "feedback" && req.method === "GET") {
        if (!service.feedback?.listFeedbackForUser) return sendJson(res, 503, { code: "FEEDBACK_LIST_UNAVAILABLE" });
        try {
          return sendJson(res, 200, await service.feedback.listFeedbackForUser(session.sub));
        } catch (error) {
          console.error("[feedback] list failed:", error?.message || error);
          return sendJson(res, 503, { code: "FEEDBACK_LIST_FAILED" });
        }
      }
      if (feedbackRoute.operation === "markRepliesRead") {
        if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
        if (!service.feedback?.markRepliesRead) return sendJson(res, 503, { code: "FEEDBACK_READ_UNAVAILABLE" });
        try {
          const body = await readJsonBody(req);
          return sendJson(res, 200, await service.feedback.markRepliesRead(session.sub, body?.feedbackIds));
        } catch (error) {
          if (error instanceof PublicFeedbackError) return sendJson(res, 400, { code: error.code });
          console.error("[feedback] read update failed:", error?.message || error);
          return sendJson(res, 503, { code: "FEEDBACK_READ_FAILED" });
        }
      }
      if (!service.feedback?.submitFeedback) return sendJson(res, 503, { code: "FEEDBACK_SAVE_UNAVAILABLE" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      try {
        const body = await readJsonBody(req);
        try {
          service.contentModeration?.assertTextAllowed?.(body?.message ?? body?.content, { source: "feedback" });
        } catch (error) {
          if (error instanceof PublicContentModerationError) {
            const snippet = body?.message ?? body?.content;
            const matchedTerm = service.contentModeration?.findBannedContentTerm?.(snippet);
            if (matchedTerm) {
              service.contentModeration.flagViolation({
                userId: session.sub,
                source: "feedback",
                snippet,
                matchedTerm,
              }).catch((flagError) => {
                console.warn("[content-moderation] feedback flag failed:", flagError?.message || flagError);
              });
            }
            return sendJson(res, 400, { code: error.code, message: error.message });
          }
          throw error;
        }
        return sendJson(res, 200, await service.feedback.submitFeedback(session.sub, body));
      } catch (error) {
        if (error instanceof PublicFeedbackError) return sendJson(res, 400, { code: error.code });
        return sendJson(res, 503, { code: "FEEDBACK_SAVE_FAILED" });
      }
    }
    if (visionRoute) {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.vision?.analyzeImage) return sendJson(res, 503, { code: "VISION_SERVICE_NOT_CONFIGURED" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      const startedAt = Date.now();
      try {
        const body = await readJsonBody(req, MAX_VISION_BODY_BYTES);
        // Invalid or oversized local camera files must not consume a daily scan.
        service.vision?.validateImage?.(body);
        if (service.operationGuard?.consumeQuota) {
          await service.operationGuard.consumeQuota(session.sub, "vision_analysis_daily", {
            limit: VISION_DAILY_LIMIT,
            windowSeconds: VISION_DAILY_WINDOW_SECONDS,
          });
          await service.operationGuard.consumeQuota(session.sub, "vision_analysis_burst", {
            limit: VISION_BURST_LIMIT,
            windowSeconds: VISION_BURST_WINDOW_SECONDS,
          });
        }
        const visionMeta = {
          userId: session.sub,
          feature: "vision",
          model: service.vision?.model || service.modelCatalog?.find((item) => item.feature === "vision")?.model || null,
          provider: service.vision?.provider || null,
        };
        const result = await service.vision.analyzeImage(session.sub, body);
        const visionModel = result?.model || visionMeta.model;
        const resolvedVisionMeta = {
          ...visionMeta,
          model: visionModel,
          provider: result?.provider || visionMeta.provider,
          hops: Number(result?.modelHops) || 1,
        };
        const latencyMs = Date.now() - startedAt;
        service.observability?.recordMetric?.("vision_success", 1, resolvedVisionMeta).catch(() => {});
        service.observability?.recordMetric?.("vision_latency_ms", latencyMs, resolvedVisionMeta).catch(() => {});
        service.observability?.recordMetric?.("vision_model_hops", Number(result?.modelHops) || 1, resolvedVisionMeta).catch(() => {});
        recordModelUsage(service.observability, {
          model: visionModel,
          feature: "vision",
          provider: result?.provider || visionMeta.provider || "qwen",
          usage: result?.usage || null,
          requests: 0,
        }).catch(() => {});
        return sendJson(res, 200, result);
      } catch (error) {
        if (error instanceof PublicOperationError && error.code === "RATE_LIMITED") {
          service.observability?.recordMetric?.("rate_limited", 1, {
            userId: session.sub,
            operation: "vision_analysis",
            feature: "vision",
          }).catch(() => {});
          return sendJson(res, 429, { code: error.code, message: error.message });
        }
        service.observability?.recordMetric?.("vision_failure", 1, {
          userId: session.sub,
          feature: "vision",
          model: service.vision?.model || null,
          provider: service.vision?.provider || null,
          latencyMs: Date.now() - startedAt,
        }).catch(() => {});
        if (
          error instanceof PublicVisionDataError
          || error instanceof PublicVisionError
          || error instanceof PublicQwenVisionError
          || error instanceof PublicImageSecurityError
        ) {
          if (error.code === "VISION_CONTENT_BLOCKED") {
            service.contentModeration?.flagViolation?.({
              userId: session.sub,
              source: "vision",
              snippet: "[image]",
              matchedTerm: "img_sec_check",
              imagePath: error.imagePath || null,
            }).catch((flagError) => {
              console.warn("[content-moderation] vision flag failed:", flagError?.message || flagError);
            });
          }
          const statusCode = error.code === "VISION_IMAGE_INVALID"
            || error.code === "VISION_RESULT_INVALID"
            || error.code === "VISION_NON_FOOD"
            || error.code === "VISION_CONTENT_BLOCKED"
            ? 400
            : 503;
          console.error("[vision] known error:", error.code, error.message);
          return sendJson(res, statusCode, { code: error.code, message: error.message });
        }
        console.error("[vision] unexpected error:", error?.message || error, error?.stack || "");
        return sendJson(res, 503, { code: "VISION_SERVICE_UNAVAILABLE", message: "识别服务暂时不可用，请稍后重试" });
      }
    }
    if (dataOperation === "getAccount" && req.method === "GET") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.data?.getAccount) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.getAccount(session.sub)); } catch { return sendJson(res, 503, { code: "ACCOUNT_READ_FAILED" }); }
    }
    if (dataOperation === "accountUsage" && req.method === "GET") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      try {
        let coach = { used: 0, limit: COACH_DAILY_MESSAGE_LIMIT, remaining: COACH_DAILY_MESSAGE_LIMIT };
        if (typeof service.coach?.getDailyUsage === "function") {
          coach = await service.coach.getDailyUsage(session.sub);
        } else if (typeof service.operationGuard?.getQuotaUsage === "function") {
          coach = await service.operationGuard.getQuotaUsage(session.sub, "coach_daily_message", {
            limit: COACH_DAILY_MESSAGE_LIMIT,
            windowSeconds: VISION_DAILY_WINDOW_SECONDS,
          });
        }
        const vision = service.operationGuard?.getQuotaUsage
          ? await service.operationGuard.getQuotaUsage(session.sub, "vision_analysis_daily", {
              limit: VISION_DAILY_LIMIT,
              windowSeconds: VISION_DAILY_WINDOW_SECONDS,
            })
          : { used: 0, limit: VISION_DAILY_LIMIT, remaining: VISION_DAILY_LIMIT };
        return sendJson(res, 200, { vision, coach });
      } catch (error) {
        console.error("[account-usage] failed:", error?.message || error);
        return sendJson(res, 503, { code: "ACCOUNT_USAGE_UNAVAILABLE" });
      }
    }
    if (dataOperation === "cancelAccount") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service?.accountDeletion?.cancelAccount) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      if (req.method !== "POST") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      let clientRequestId = null;
      try {
        const body = await readJsonBody(req);
        clientRequestId = body?.clientRequestId ?? null;
        service.observability?.recordDeletion?.({
          userId: session.sub,
          clientRequestId,
          outcome: "started",
        });
        const result = await service.accountDeletion.cancelAccount(session.sub, body);
        service.observability?.recordMetric?.("account_cancel_success", 1, { userId: session.sub }).catch(() => {});
        service.observability?.recordDeletion?.({
          userId: session.sub,
          clientRequestId,
          outcome: "succeeded",
        });
        return sendJson(res, 200, result);
      } catch (error) {
        service.observability?.recordMetric?.("account_cancel_failure", 1, { userId: session.sub }).catch(() => {});
        if (clientRequestId) {
          service.observability?.recordDeletion?.({
            userId: session.sub,
            clientRequestId,
            outcome: "failed",
            errorCode: error?.code || "ACCOUNT_CANCELLATION_FAILED",
          });
        }
        if (error instanceof PublicAccountDeletionError || error instanceof PublicOperationError) {
          return sendJson(res, error instanceof PublicOperationError ? 409 : 400, { code: error.code });
        }
        console.error("[account-cancellation] failed:", error?.code || "UNKNOWN", error?.message || error);
        return sendJson(res, 503, { code: "ACCOUNT_CANCELLATION_FAILED" });
      }
    }
    if (dataOperation === "nutritionPlan" && req.method === "GET") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.data?.getNutritionPlan) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.getNutritionPlan(session.sub)); } catch { return sendJson(res, 503, { code: "NUTRITION_PLAN_READ_FAILED" }); }
    }
    if (dataOperation === "saveSettings" && req.method === "PATCH") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.data?.saveSettings) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.saveSettings(session.sub, await readJsonBody(req))); } catch { return sendJson(res, 400, { code: "SETTINGS_SAVE_FAILED" }); }
    }
    if (dataOperation === "nutritionPlan" && req.method === "PATCH") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      if (!service.data?.saveNutritionPlan) return sendJson(res, 401, { code: "UNAUTHORIZED" });
      try { return sendJson(res, 200, await service.data.saveNutritionPlan(session.sub, await readJsonBody(req))); } catch { return sendJson(res, 400, { code: "NUTRITION_PLAN_SAVE_FAILED" }); }
    }
    if (dataOperation === "previewNutritionPlan" && req.method === "POST") {
      const session = await authorizeProductRequest(service, req, res);
      if (!session) return;
      try {
        const body = await readJsonBody(req);
        const formulaPlan = formulaNutritionPlanFallback(body);
        let aiPlan = null;
        if (typeof service.calculateNutritionPlan === "function") {
          aiPlan = await service.calculateNutritionPlan(body);
        }
        if (aiPlan?.usage && aiPlan?.model) {
          recordModelUsage(service.observability, {
            model: aiPlan.model,
            feature: "nutrition_plan",
            provider: "deepseek",
            usage: aiPlan.usage,
            requests: 0,
          }).catch(() => {});
        }
        return sendJson(res, 200, {
          ...formulaPlan,
          ...(typeof aiPlan?.insight === "string" && aiPlan.insight.trim()
            ? { insight: aiPlan.insight.trim().slice(0, 80) }
            : {}),
        });
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
        const session = await authorizeProductRequest(service, req, res);
        if (!session) return;
        if (!service.data?.[dataOperation]) {
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
  } catch (error) {
    // Keep the public surface fail-closed while retaining a sanitized startup
    // signal in CloudBase logs. This makes a configuration/dependency outage
    // diagnosable without ever printing credential values.
    console.error("[startup] get-login-ticket service initialization failed:", error?.message || error);
  }
  createHttpServer({ service }).listen(9000);
}

module.exports = {
  buildModelCatalog,
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
