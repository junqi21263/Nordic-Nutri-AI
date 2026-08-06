import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { PublicOperationError } from "./operation-guard.cjs";

import {
  createHttpServer,
  createHunyuanGenerationService,
  createRuntimeService,
  readRuntimeConfig,
  selectDeepseekModel,
  signFoodImageDispatch,
} from "./index.js";

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function createRuntimeDb() {
  return {
    from: () => ({}),
    rpc: () => Promise.resolve({ data: [{ allowed: true }], error: null }),
  };
}

test("validates runtime configuration without constructing database-dependent services", () => {
  assert.deepEqual(readRuntimeConfig({
    WX_APPID: "wx-app",
    WX_SECRET: "wx-secret",
    TCB_ENV: "env-id",
    IDENTITY_HASH_PEPPER: "identity-pepper",
    CLOUDBASE_APIKEY: "cloudbase-key",
    APP_SESSION_SECRET: "session-secret",
  }), {
    appId: "wx-app",
    appSecret: "wx-secret",
    cloudbaseEnvId: "env-id",
    identityPepper: "identity-pepper",
    cloudbaseApiKey: "cloudbase-key",
    sessionSecret: "session-secret",
  });
});

test("assembles every runtime service after the RDB client is available", () => {
  const db = createRuntimeDb();
  const service = createRuntimeService({
    WX_APPID: "wx-app",
    WX_SECRET: "wx-secret",
    TCB_ENV: "env-id",
    IDENTITY_HASH_PEPPER: "identity-pepper",
    CLOUDBASE_APIKEY: "cloudbase-key",
    APP_SESSION_SECRET: "session-secret",
  }, {
    cloudbaseSdk: { init: () => ({ rdb: () => db }) },
  });

  for (const capability of ["issue", "verifySession"]) assert.equal(typeof service[capability], "function");
  for (const capability of ["data", "meals", "insights", "coach", "feedback"]) assert.ok(service[capability]);
  assert.equal(service.vision, null);
  assert.equal(service.foodImageDispatchSecret, "");
});

test("uses the existing worker secret only as a first-rollout fallback for dispatch", () => {
  const db = createRuntimeDb();
  const service = createRuntimeService({
    WX_APPID: "wx-app", WX_SECRET: "wx-secret", TCB_ENV: "env-id", IDENTITY_HASH_PEPPER: "identity-pepper",
    CLOUDBASE_APIKEY: "cloudbase-key", APP_SESSION_SECRET: "session-secret", AI_WORKER_SHARED_SECRET: "worker-secret",
  }, { cloudbaseSdk: { init: () => ({ rdb: () => db }) } });
  assert.equal(service.foodImageDispatchSecret, "worker-secret");
});

test("delegates food insight to dev through the existing signed worker configuration", async () => {
  const workerOptions = [];
  const service = createRuntimeService({
    WX_APPID: "wx-app", WX_SECRET: "wx-secret", TCB_ENV: "env-id", IDENTITY_HASH_PEPPER: "identity-pepper",
    CLOUDBASE_APIKEY: "cloudbase-key", APP_SESSION_SECRET: "session-secret",
    HY_IMAGE_WORKER_ENDPOINT: "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/hunyuan-image-worker/generate",
    AI_WORKER_SHARED_SECRET: "worker-secret",
  }, {
    cloudbaseSdk: { init: () => ({ rdb: () => createRuntimeDb() }) },
    cloudbaseNodeSdk: { init: () => ({}) },
    nutritionInsightWorkerClientFactory: (options) => {
      workerOptions.push(options);
      return {
        generateInsight: async () => ({
          headline: "鸡胸肉的营养参考",
          content: "每100g约含19.3g蛋白质，可搭配蔬菜和主食。",
          source: "hunyuan-exp",
          model: "hunyuan-2.0-instruct-20251111",
        }),
      };
    },
  });

  const insight = await service.foodInsight.getInsight({
    nameZh: "鸡胸肉",
    nutritionPer100g: { calories: 132, protein: 19.3, carbs: 0, fat: 1 },
  });

  assert.equal(workerOptions.length, 1);
  assert.equal(workerOptions[0].endpoint, "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/hunyuan-image-worker/nutrition-insight");
  assert.equal(workerOptions[0].sharedSecret, "worker-secret");
  assert.equal(insight.source, "hunyuan-exp");
});

test("routes homepage daily insight to DeepSeek while auxiliary content stays on the dev worker", () => {
  const dailyInsightOptions = [];
  const workerOptions = [];
  const service = createRuntimeService({
    WX_APPID: "wx-app", WX_SECRET: "wx-secret", TCB_ENV: "env-id", IDENTITY_HASH_PEPPER: "identity-pepper",
    CLOUDBASE_APIKEY: "cloudbase-key", APP_SESSION_SECRET: "session-secret",
    DEEPSEEK_API_KEY: "deepseek-key", DEEPSEEK_MODEL: "deepseek-v4-pro",
    HY_IMAGE_WORKER_ENDPOINT: "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/hunyuan-image-worker/generate",
    AI_WORKER_SHARED_SECRET: "worker-secret",
  }, {
    cloudbaseSdk: { init: () => ({ rdb: () => createRuntimeDb() }) },
    cloudbaseNodeSdk: { init: () => ({}) },
    dailyInsightFactory: (options) => {
      dailyInsightOptions.push(options);
      return async () => ({ focus: "protein", headline: "补蛋白", content: "下一餐补一份蛋白质。", source: "deepseek", model: options.model });
    },
    nutritionInsightWorkerClientFactory: (options) => {
      workerOptions.push(options);
      return {
        generateInsight: async () => ({ headline: "食物洞察", content: "搭配蔬菜和主食。", source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" }),
      };
    },
  });

  assert.equal(dailyInsightOptions.length, 1);
  assert.equal(dailyInsightOptions[0].apiKey, "deepseek-key");
  assert.equal(dailyInsightOptions[0].model, "deepseek-v4-pro");
  assert.equal(dailyInsightOptions[0].source, "deepseek");
  assert.equal(dailyInsightOptions[0].requestCompletion, undefined);
  assert.equal(workerOptions.length, 1);
});

test("uses the primary runtime identity for generated-image storage in remote-worker mode", async () => {
  const uploads = [];
  const db = createRuntimeDb();
  const runtimeStorage = {
    uploadFile: async ({ cloudPath }) => {
      uploads.push(cloudPath);
      return { fileID: `cloud://primary/${cloudPath}` };
    },
    getTempFileURL: async () => ({ fileList: [] }),
  };
  const apiKeyStorage = {
    uploadFile: async () => {
      throw new Error("API-key fallback must not be used when runtime identity works");
    },
  };
  const service = createRuntimeService({
    WX_APPID: "wx-app",
    WX_SECRET: "wx-secret",
    TCB_ENV: "env-id",
    IDENTITY_HASH_PEPPER: "identity-pepper",
    CLOUDBASE_APIKEY: "cloudbase-key",
    APP_SESSION_SECRET: "session-secret",
    HY_IMAGE_WORKER_ENDPOINT: "https://worker.example/generate",
    AI_WORKER_SHARED_SECRET: "worker-secret",
  }, {
    cloudbaseSdk: { init: () => ({ rdb: () => db }) },
    cloudbaseNodeSdk: { init: (options) => options.accessKey ? apiKeyStorage : runtimeStorage },
  });

  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  const saved = await service.foodImage.persistGeneratedImage({
    buffer: image,
    mimeType: "image/png",
    foodId: "food-1",
    imageId: "image-1",
  });

  assert.ok(saved.originalFileId.startsWith("cloud://primary/"));
  assert.equal(saved.originalUrl, null);
  assert.equal(saved.detailUrl, null);
  assert.ok(uploads.length >= 1);
});

test("maps deprecated DeepSeek aliases to the supported V4 Flash model", () => {
  assert.equal(selectDeepseekModel(undefined), "deepseek-v4-flash");
  assert.equal(selectDeepseekModel("deepseek-chat"), "deepseek-v4-flash");
  assert.equal(selectDeepseekModel("deepseek-reasoner"), "deepseek-v4-flash");
  assert.equal(selectDeepseekModel("deepseek-v4-pro"), "deepseek-v4-pro");
});

test("routes Hunyuan generation through the signed worker when configured", async () => {
  const workerCalls = [];
  const service = createHunyuanGenerationService({
    env: {
      FOOD_IMAGE_GENERATION_ENABLED: "true",
      HY_IMAGE_MODEL: "HY-Image-3.0-Plus-4090-Tob-v1.0",
      HY_IMAGE_SIZE: "1280x720",
      HY_IMAGE_WORKER_ENDPOINT: "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/hunyuan-image-worker/generate",
      AI_WORKER_SHARED_SECRET: "worker-secret",
    },
    aiClient: null,
    createWorkerClient: (config) => {
      assert.equal(config.sharedSecret, "worker-secret");
      return {
        generateImage: async (input) => {
          workerCalls.push(input);
          return { data: [{ url: "https://temporary.example/image.png" }] };
        },
      };
    },
  });

  const generated = await service.generateOne({ foodNameZh: "水煮鸡胸肉", cookingMethod: "水煮" });
  assert.equal(generated.temporaryUrl, "https://temporary.example/image.png");
  assert.equal(workerCalls.length, 1);
  assert.equal(workerCalls[0].model, "HY-Image-3.0-Plus-4090-Tob-v1.0");
  assert.equal(workerCalls[0].size, "1280x720");
});

test("only accepts JSON POST requests and never exposes OpenID", async () => {
  const server = createHttpServer({
    service: {
      issue: async ({ code }) => ({
        user: { id: `user:${code}` },
        session: { accessToken: "product-session" },
        onboardingRequired: true,
      }),
    },
  });

  await withServer(server, async (baseUrl) => {
    const unsupported = await fetch(baseUrl, { method: "GET" });
    assert.equal(unsupported.status, 405);

    const nonJson = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify({ code: "fresh-code" }),
    });
    assert.equal(nonJson.status, 400);

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "fresh-code" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: { id: "user:fresh-code" },
      session: { accessToken: "product-session" },
      onboardingRequired: true,
    });
  });
});

test("returns a generic configuration error without booting a fallback login path", async () => {
  const server = createHttpServer({ service: null });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "fresh-code" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "LOGIN_SERVICE_NOT_CONFIGURED" });
  });
});

test("writes product data only with a valid product session", async () => {
  const server = createHttpServer({
    service: {
      issue: async () => { throw new Error("not used"); },
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      data: { saveProfile: async (userId, body) => ({ id: userId, nickname: body.nickname }) },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/profile`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Lewis" }),
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED" });

    const response = await fetch(`${baseUrl}/get-login-ticket/profile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ nickname: "Lewis", userId: "attacker-controlled" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "user-1", nickname: "Lewis" });
  });
});

test("uploads a profile avatar only through the authenticated product session", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      avatar: { upload: async (userId, body) => { calls.push({ userId, body }); return { avatarUrl: "https://temp.example/avatar.png" }; } },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/profile/avatar`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mimeType: "image/png", base64: "abc" }),
    });
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/get-login-ticket/profile/avatar`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ mimeType: "image/png", base64: "abc" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { avatarUrl: "https://temp.example/avatar.png" });
    assert.deepEqual(calls, [{ userId: "user-1", body: { mimeType: "image/png", base64: "abc" } }]);
  });
});

test("reads the signed-in account without accepting a client user id", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      data: { getAccount: async (userId) => ({ userId, nickname: "Lewis" }) },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/account`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/get-login-ticket/account`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: "user-1", nickname: "Lewis" });
  });
});

test("rejects cancelled-account sessions with SESSION_USER_MISSING", async () => {
  const server = createHttpServer({
    service: {
      verifySession: () => ({ sub: "gone-user" }),
      productUserExists: async () => false,
      data: { getAccount: async () => ({ nickname: "should-not-run" }) },
    },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/account`, {
      headers: { authorization: "Bearer stale-session" },
    });
    assert.equal(response.status, 401);
    assert.deepEqual(await response.json(), {
      code: "SESSION_USER_MISSING",
      message: "登录已失效，请重新登录",
    });
  });
});

test("cancels only the authenticated product account", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-a" } : null,
      accountDeletion: {
        cancelAccount: async (userId, body) => {
          calls.push({ userId, body });
          return { deleted: true };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/get-login-ticket/account/cancel`, { method: "POST" });
    assert.equal(denied.status, 401);
    const accepted = await fetch(`${baseUrl}/get-login-ticket/account/cancel`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT", clientRequestId: "11111111-2222-4333-8444-555555555555", userId: "attacker" }),
    });
    assert.deepEqual(await accepted.json(), { deleted: true });
    assert.deepEqual(calls, [{ userId: "user-a", body: { confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT", clientRequestId: "11111111-2222-4333-8444-555555555555", userId: "attacker" } }]);
  });
});

test("returns a conflict instead of repeating an in-progress account cancellation", async () => {
  const server = createHttpServer({
    service: {
      verifySession: () => ({ sub: "user-a" }),
      accountDeletion: { cancelAccount: async () => { throw new PublicOperationError("OPERATION_IN_PROGRESS", "请求正在处理中"); } },
    },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/account/cancel`, {
      method: "POST", headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT", clientRequestId: "11111111-2222-4333-8444-555555555555" }),
    });
    assert.equal(response.status, 409);
    assert.deepEqual(await response.json(), { code: "OPERATION_IN_PROGRESS" });
  });
});

test("serves food catalog searches only through the authenticated product session", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodRepository: {
        listFoods: async (options) => {
          calls.push(options);
          return {
            items: [{ id: "food-1", source: "usda", sourceId: "1", nameEn: "Chicken breast", normalizedName: "chicken breast", category: { code: "meat_poultry" }, nutritionPer100g: { calories: 165, protein: 31, carbs: 0, fat: 3.6 } }],
            pagination: { page: options.page, pageSize: options.pageSize, total: 1, hasMore: false },
          };
        },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/foods?query=chicken&page=1`);
    assert.equal(unauthorized.status, 401);

    const wrongMethod = await fetch(`${baseUrl}/get-login-ticket/foods?query=chicken&page=1`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(wrongMethod.status, 405);

    const response = await fetch(`${baseUrl}/get-login-ticket/foods?query=chicken&page=2`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "standard_food_v1");
    assert.equal(body.page, 2);
    assert.equal(body.items[0].description, "Chicken breast");
    assert.deepEqual(calls, [{ q: "chicken", categoryCodes: [], tagCodes: [], page: 2, pageSize: 20, sort: "recommended" }]);
  });
});

test("serves randomized food catalog discovery only through the authenticated product session", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodRepository: {
        listFoods: async (options) => {
          calls.push(options);
          return { items: [{ id: "food-1", source: "usda", sourceId: "2", nameEn: "Salmon", normalizedName: "salmon", nutritionPer100g: { calories: 206, protein: 22, carbs: 0, fat: 12 } }], pagination: { page: 1, pageSize: 10, total: 1, hasMore: false } };
        },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/foods/discover`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/get-login-ticket/foods/discover`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.source, "standard_food_v1");
    assert.equal(body.items[0].description, "三文鱼");
    assert.deepEqual(calls, [{ page: 1, pageSize: 10, sort: "recommended" }]);
  });
});

test("serves food variants for a catalog item", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodRepository: {
        listFoodVariants: async (foodId) => [
          { id: foodId, description: "牛肉", variantLabelZh: null },
          { id: "variant-1", description: "牛肉", variantLabelZh: "熟制版本" },
        ],
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/foods/11111111-1111-4111-8111-111111111111/variants`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).items.map((item) => item.id), [
      "11111111-1111-4111-8111-111111111111",
      "variant-1",
    ]);
  });
});

test("updates settings and nutrition plans only for the signed-in user", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      data: {
        saveSettings: async (userId, body) => { calls.push({ operation: "settings", userId, body }); return { id: userId }; },
        getNutritionPlan: async (userId) => ({ id: "plan-1", userId }),
        saveNutritionPlan: async (userId, body) => { calls.push({ operation: "plan", userId, body }); return { id: "plan-2" }; },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const settings = await fetch(`${baseUrl}/get-login-ticket/settings`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ userId: "attacker", mealsPerDay: 4 }),
    });
    assert.equal(settings.status, 200);

    const current = await fetch(`${baseUrl}/get-login-ticket/nutrition-plan`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(current.status, 200);
    assert.deepEqual(await current.json(), { id: "plan-1", userId: "user-1" });

    const plan = await fetch(`${baseUrl}/get-login-ticket/nutrition-plan`, {
      method: "PATCH", headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ userId: "attacker", calories: 2300 }),
    });
    assert.equal(plan.status, 200);
    assert.deepEqual(calls.map((call) => call.userId), ["user-1", "user-1"]);
  });
});

test("serves meal reads only through the authenticated product session", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      meals: { listMeals: async (userId, date) => { calls.push({ userId, date }); return [{ id: "meal-1" }]; } },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/meals?date=2026-07-20`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/get-login-ticket/meals?date=2026-07-20`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), [{ id: "meal-1" }]);
    assert.deepEqual(calls, [{ userId: "user-1", date: "2026-07-20" }]);
  });
});

test("serves meal ranges, individual meals, summaries, reviews, and achievements for the signed-in user", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      meals: {
        listMealsRange: async (userId, from, to) => { calls.push(["range", userId, from, to]); return [{ id: "meal-1" }]; },
        getMeal: async (userId, mealId) => { calls.push(["detail", userId, mealId]); return { id: mealId }; },
      },
      insights: {
        getDailySummaryWithInsight: async (userId, date) => { calls.push(["summary", userId, date]); return { date, insight: { content: "先记录第一餐" } }; },
        getWeeklyReview: async (userId, date) => { calls.push(["review", userId, date]); return { endDate: date }; },
        getAchievements: async (userId, date) => { calls.push(["achievements", userId, date]); return [{ id: "first" }]; },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const headers = { authorization: "Bearer valid-session" };
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/meals?from=2026-07-14&to=2026-07-20`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/meals/22222222-2222-4222-8222-222222222222`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/meal-summary?date=2026-07-20`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/weekly-review?date=2026-07-20`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/achievements?date=2026-07-20`, { headers })).status, 200);
  });

  assert.deepEqual(calls, [
    ["range", "user-1", "2026-07-14", "2026-07-20"],
    ["detail", "user-1", "22222222-2222-4222-8222-222222222222"],
    ["summary", "user-1", "2026-07-20"],
    ["review", "user-1", "2026-07-20"],
    ["achievements", "user-1", "2026-07-20"],
  ]);
});

test("writes meal analysis and meal data without accepting a caller-controlled user id", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      meals: {
        createAnalysis: async (userId, body) => { calls.push({ operation: "analysis", userId, body }); return { id: "analysis-1" }; },
        createMeal: async (userId, body) => { calls.push({ operation: "create", userId, body }); return { id: "meal-1" }; },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const analysis = await fetch(`${baseUrl}/get-login-ticket/meal-analysis`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ userId: "attacker", clientRequestId: "11111111-1111-4111-8111-111111111111", items: [] }),
    });
    assert.equal(analysis.status, 200);

    const meal = await fetch(`${baseUrl}/get-login-ticket/meals`, {
      method: "POST", headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ userId: "attacker", clientRequestId: "11111111-1111-4111-8111-111111111111" }),
    });
    assert.equal(meal.status, 200);
    assert.deepEqual(calls.map((call) => call.userId), ["user-1", "user-1"]);
  });
});

test("reads, writes, and summarizes coach data only for the signed-in user", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      coach: {
        getMessages: async (userId) => { calls.push(["read", userId]); return []; },
        sendMessage: async (userId, body) => { calls.push(["write", userId, body]); return { messages: [] }; },
        getBrief: async (userId, date) => { calls.push(["brief", userId, date]); return { date, priority: "protein" }; },
        restartConversation: async (userId) => { calls.push(["restart", userId]); return { conversationId: "conversation-2", messages: [] }; },
        getDailyTip: async (userId, date) => { calls.push(["daily-tip", userId, date]); return { type: "food_knowledge", headline: "看营养成分表", content: "先看每份含量。" }; },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const headers = { authorization: "Bearer valid-session" };
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/messages`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach-answer`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ userId: "attacker", prompt: "晚餐吃什么？" }),
    })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/brief?date=2026-07-20`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/brief?date=2026-07-20`, { method: "POST", headers })).status, 405);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/daily-tip?date=2026-07-20`, { headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/daily-tip`, { headers })).status, 400);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/restart`, { method: "POST", headers })).status, 200);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/restart`, { method: "GET", headers })).status, 405);
    assert.equal((await fetch(`${baseUrl}/get-login-ticket/coach/brief?date=2026-07-20`)).status, 401);
  });

  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [["read", "user-1"], ["write", "user-1"], ["brief", "user-1"], ["daily-tip", "user-1"], ["restart", "user-1"]]);
});

test("streams coach events only for the authenticated product user", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      coach: {
        streamMessage: async function* (userId, body) {
          assert.equal(userId, "user-1");
          assert.equal(body.userId, "attacker");
          yield { type: "delta", text: "晚餐先补蛋白。" };
          yield { type: "complete", messages: [], reply: { source: "deepseek" } };
        },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/coach-answer/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt: "晚餐怎么补蛋白？" }),
    });
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/get-login-ticket/coach-answer/stream`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ userId: "attacker", prompt: "晚餐怎么补蛋白？" }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);
    assert.deepEqual((await response.text()).trim().split("\n").map(JSON.parse).map((event) => event.type), ["delta", "complete"]);
  });
});

test("keeps the coach daily-limit code in streaming responses", async () => {
  const server = createHttpServer({
    service: {
      verifySession: () => ({ sub: "user-1" }),
      coach: {
        streamMessage: async function* () {
          const error = new Error("因个人开发成本有限，当前每人每日限制聊20句");
          error.code = "COACH_DAILY_LIMIT_REACHED";
          throw error;
        },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/coach-answer/stream`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ prompt: "晚餐怎么补蛋白？" }),
    });
    const event = JSON.parse((await response.text()).trim());
    assert.equal(event.code, "COACH_DAILY_LIMIT_REACHED");
  });
});

test("persists feedback only for the signed-in user", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      feedback: { submitFeedback: async (userId, body) => { calls.push({ userId, body }); return { id: "feedback-1" }; } },
    },
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/feedback`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ userId: "attacker", content: "建议" }),
    });
    assert.equal(response.status, 200);
  });
  assert.equal(calls[0].userId, "user-1");
});

test("accepts authenticated visual analysis without trusting a client user id", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      vision: { analyzeImage: async (userId, body) => { calls.push({ userId, body }); return { mealName: "午餐" }; } },
    },
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/vision-analysis`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ userId: "attacker", imageBase64: "AA==" }),
    });
    assert.equal(response.status, 200);
  });
  assert.equal(calls[0].userId, "user-1");
});

test("serves food categories and tags to authenticated users", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodRepository: {
        listCategories: async () => [{ code: "meat", nameZh: "肉禽" }],
        listTags: async () => [{ code: "high_protein", nameZh: "高蛋白" }],
        suggestions: async () => [{ id: "f1", nameEn: "Chicken" }],
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const cats = await fetch(`${baseUrl}/get-login-ticket/foods/categories`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(cats.status, 200);
    assert.equal((await cats.json()).items[0].code, "meat");

    const tags = await fetch(`${baseUrl}/get-login-ticket/foods/tags`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal((await tags.json()).items[0].code, "high_protein");

    const sug = await fetch(`${baseUrl}/get-login-ticket/foods/suggestions?q=chicken`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal((await sug.json()).items[0].nameEn, "Chicken");
  });
});

test("serves a CloudBase-generated insight for an authenticated food detail request", async () => {
  const calls = [];
  const foodId = "11111111-2222-4333-8444-555555555555";
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodRepository: {
        getFoodById: async (id) => {
          calls.push(["food", id]);
          return { id, nameZh: "鸡胸肉", nutritionPer100g: { calories: 132, protein: 19.3, carbs: 0, fat: 1 } };
        },
      },
      foodInsight: {
        getInsight: async (food) => {
          calls.push(["insight", food.id]);
          return { headline: "鸡胸肉的蛋白质优势", content: "每100g约含19.3g蛋白质。", source: "cloudbase", model: "hy3" };
        },
      },
    },
  });

  await withServer(server, async (baseUrl) => {
    const path = `${baseUrl}/get-login-ticket/foods/${foodId}/insight`;
    assert.equal((await fetch(path)).status, 401);
    assert.equal((await fetch(path, { method: "POST", headers: { authorization: "Bearer valid-session" } })).status, 405);
    const response = await fetch(path, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).source, "cloudbase");
  });

  assert.deepEqual(calls, [["food", foodId], ["insight", foodId]]);
});

test("barcode lookup returns 404 when missing", async () => {
  const { FoodBarcodeError } = await import("./food-barcode-service.cjs");
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodBarcode: { lookup: async (code) => { if (code === "5449000000996") return { food: { id: "f1" }, source: "cache" }; throw new FoodBarcodeError("FOOD_BARCODE_NOT_FOUND"); } },
    },
  });
  await withServer(server, async (baseUrl) => {
    const ok = await fetch(`${baseUrl}/get-login-ticket/foods/barcode/5449000000996`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).source, "cache");

    const missing = await fetch(`${baseUrl}/get-login-ticket/foods/barcode/0000000000000`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(missing.status, 404);
    assert.equal((await missing.json()).code, "FOOD_BARCODE_NOT_FOUND");
  });
});

test("admin food routes reject product sessions without admin_console role", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodAdmin: {
        listMissingImages: async () => ({ items: [] }),
        listSyncJobs: async () => ({ items: [] }),
        listFoods: async () => ({ items: [], pagination: { page: 1, pageSize: 20, total: 0, hasMore: false } }),
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const r1 = await fetch(`${baseUrl}/get-login-ticket/api/admin/foods/missing-images`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(r1.status, 401);
    const r2 = await fetch(`${baseUrl}/get-login-ticket/api/admin/foods/sync-jobs`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(r2.status, 401);
    const r3 = await fetch(`${baseUrl}/get-login-ticket/api/admin/foods`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(r3.status, 401);
  });
});

test("admin login issues an admin_console session token", async () => {
  const server = createHttpServer({
    service: {
      adminConsoleAuth: {
        login: async ({ username, password }) => {
          assert.equal(username, "ops");
          assert.equal(password, "secret");
          return { user: { id: "admin-1" }, session: { accessToken: "admin-token" } };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/get-login-ticket/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "ops", password: "secret" }),
    });
    assert.equal(denied.status, 200);
    assert.deepEqual(await denied.json(), { user: { id: "admin-1" }, session: { accessToken: "admin-token" } });
  });
});

test("admin foods collection supports GET list and POST create", async () => {
  const calls = [];
  const foodId = "11111111-2222-4333-8444-555555555555";
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "admin-1", role: "admin_console" } : null,
      foodAdmin: {
        listFoods: async (userId, query) => {
          calls.push(["list", userId, query.active]);
          return { items: [{ id: foodId, nameZh: "苹果", isActive: true }], pagination: { page: 1, pageSize: 20, total: 1, hasMore: false } };
        },
        createFood: async (userId, body) => {
          calls.push(["create", userId, body.nameZh]);
          return { id: foodId, nameZh: body.nameZh, source: "manual", isActive: true };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/get-login-ticket/api/admin/foods`);
    assert.equal(denied.status, 401);

    const listed = await fetch(`${baseUrl}/get-login-ticket/api/admin/foods?active=all`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal(listed.status, 200);
    const listBody = await listed.json();
    assert.equal(listBody.items[0].id, foodId);

    const created = await fetch(`${baseUrl}/get-login-ticket/api/admin/foods`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ nameZh: "手工录入", calories: 100, proteinG: 10, carbsG: 5, fatG: 2 }),
    });
    assert.equal(created.status, 201);
    assert.equal((await created.json()).nameZh, "手工录入");
  });
  assert.deepEqual(calls, [["list", "admin-1", "all"], ["create", "admin-1", "手工录入"]]);
});

test("food image upload requires authentication and a base64 payload", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      foodImage: { acquireFromUpload: async () => ({ storagePath: "foods/k/hash", thumbUrl: null, mediumUrl: null, detailUrl: "https://cdn/x", contentHash: "h", mimeType: "image/webp", fileSize: 10, width: null, height: null }) },
      foodRepository: { insertImage: async (record) => ({ id: "img1", ...record }) },
    },
  });
  await withServer(server, async (baseUrl) => {
    const noAuth = await fetch(`${baseUrl}/get-login-ticket/foods/images/upload`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ imageBase64: "AA==" }) });
    assert.equal(noAuth.status, 401);

    const empty = await fetch(`${baseUrl}/get-login-ticket/foods/images/upload`, { method: "POST", headers: { authorization: "Bearer valid-session", "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(empty.status, 400);

    const ok = await fetch(`${baseUrl}/get-login-ticket/foods/images/upload`, { method: "POST", headers: { authorization: "Bearer valid-session", "content-type": "application/json" }, body: JSON.stringify({ imageBase64: "AA==", contentType: "image/jpeg" }) });
    assert.equal(ok.status, 200);
    assert.equal((await ok.json()).image.status, "pending");
  });
});

test("batch image routes are admin-session protected and expose live batch state", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "admin-1", role: "admin_console" } : null,
      foodImageBatches: {
        list: async (userId) => ({ items: [{ id: "11111111-2222-4333-8444-555555555555", status: "running", pendingCount: 19 }], userId }),
        createFirstSample: async (userId) => { calls.push(userId); return { id: "11111111-2222-4333-8444-555555555555", status: "draft" }; },
        start: async () => ({ id: "11111111-2222-4333-8444-555555555555", status: "running" }),
        get: async () => ({ batch: { id: "11111111-2222-4333-8444-555555555555", status: "running" }, items: [] }),
        processNext: async () => ({ processed: 1, batch: { id: "11111111-2222-4333-8444-555555555555", status: "running" } }),
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-image-batches`);
    assert.equal(denied.status, 401);
    const listed = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-image-batches`, { headers: { authorization: "Bearer valid-session" } });
    assert.equal((await listed.json()).items[0].pendingCount, 19);
    const created = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-image-batches/first-sample`, { method: "POST", headers: { authorization: "Bearer valid-session" } });
    assert.equal((await created.json()).id, "11111111-2222-4333-8444-555555555555");
    assert.deepEqual(calls, ["admin-1"]);
  });
});

test("internal batch dispatcher requires an HMAC signature and does not use an admin session", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      foodImageDispatchSecret: "dispatch-test-secret",
      foodImageBatches: {
        dispatchTrusted: async (input) => {
          calls.push(input);
          return { dispatched: 2, attempted: 2 };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const path = "/get-login-ticket/api/internal/food-image-batches/dispatch";
    const body = JSON.stringify({ maxItems: 2 });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signFoodImageDispatch("dispatch-test-secret", { timestamp, path: "/api/internal/food-image-batches/dispatch", body });
    const denied = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(denied.status, 401);
    const accepted = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-food-image-dispatch-timestamp": timestamp,
        "x-food-image-dispatch-signature": signature,
      },
      body,
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), { dispatched: 2, attempted: 2 });
    assert.deepEqual(calls, [{ maxItems: 2 }]);
  });
});

test("internal vision purge fails closed when deletion-audit retention is unavailable", async () => {
  const server = createHttpServer({
    service: {
      foodImageDispatchSecret: "dispatch-test-secret",
      visionImageRetention: { purgeExpiredVisionImages: async () => ({ deleted: 0, failed: 0 }) },
    },
  });
  await withServer(server, async (baseUrl) => {
    const path = "/get-login-ticket/api/internal/vision-images/purge";
    const body = JSON.stringify({ limit: 2, purgeDeletionAudit: true });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = signFoodImageDispatch("dispatch-test-secret", {
      timestamp,
      path: "/api/internal/vision-images/purge",
      body,
    });
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-food-image-dispatch-timestamp": timestamp,
        "x-food-image-dispatch-signature": signature,
      },
      body,
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "DELETION_AUDIT_PURGE_UNAVAILABLE" });
  });
});

test("admin creates and previews a batch from one category without posting food ids", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "admin-1", role: "admin_console" } : null,
      foodImageBatches: {
        previewCategory: async (userId, body) => {
          calls.push({ op: "preview", userId, body });
          return { categoryId: body.categoryId, selectedCount: 20 };
        },
        createFromCategory: async (userId, body) => {
          calls.push({ op: "create", userId, body });
          return { id: "11111111-2222-4333-8444-555555555555", selection: { source: "category" } };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const headers = { authorization: "Bearer valid-session", "content-type": "application/json" };
    const preview = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-image-batches/preview`, {
      method: "POST", headers, body: JSON.stringify({ categoryId: "c-vegetables", count: 20 }),
    });
    assert.equal((await preview.json()).selectedCount, 20);
    const created = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-image-batches`, {
      method: "POST", headers, body: JSON.stringify({ categoryId: "c-vegetables", count: 20 }),
    });
    assert.equal((await created.json()).selection.source, "category");
  });
  assert.deepEqual(calls, [
    { op: "preview", userId: "admin-1", body: { categoryId: "c-vegetables", count: 20 } },
    { op: "create", userId: "admin-1", body: { categoryId: "c-vegetables", count: 20 } },
  ]);
});

test("rejecting a batch candidate immediately starts its server-controlled retry", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "admin-1", role: "admin_console" } : null,
      foodImageJobs: {
        rejectImage: async (userId, imageId, body) => {
          calls.push({ op: "reject", userId, imageId, body });
          return { imageId, jobId: imageId, rejected: true };
        },
      },
      foodImageBatches: {
        retryRejectedJob: async (userId, jobId) => {
          calls.push({ op: "retry", userId, jobId });
          return { processed: 1, retryScheduled: true, jobId: "replacement-job" };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-images/11111111-2222-4333-8444-555555555555/reject`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ reason: "主体不是瘦牛肉，请保留瘦肉切片和自然纹理" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      imageId: "11111111-2222-4333-8444-555555555555",
      jobId: "11111111-2222-4333-8444-555555555555",
      rejected: true,
      retry: { processed: 1, retryScheduled: true, jobId: "replacement-job" },
    });
  });
  assert.deepEqual(calls, [
    { op: "reject", userId: "admin-1", imageId: "11111111-2222-4333-8444-555555555555", body: { reason: "主体不是瘦牛肉，请保留瘦肉切片和自然纹理" } },
    { op: "retry", userId: "admin-1", jobId: "11111111-2222-4333-8444-555555555555" },
  ]);
});

test("admin can immediately retry a rejected or failed image job", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "admin-1", role: "admin_console" } : null,
      foodImageBatches: {
        retryRejectedJob: async (userId, jobId) => {
          calls.push({ userId, jobId });
          return { processed: 1, retryScheduled: true, retryItemId: "item-1" };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/get-login-ticket/api/admin/food-image-jobs/11111111-2222-4333-8444-555555555555/retry`, {
      method: "POST",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { processed: 1, retryScheduled: true, retryItemId: "item-1" });
  });
  assert.deepEqual(calls, [{ userId: "admin-1", jobId: "11111111-2222-4333-8444-555555555555" }]);
});

test("admin users and feedback routes require session and accept admin", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => (token === "valid-session" ? { sub: "admin-1", role: "admin_console" } : null),
      adminConsole: {
        listUsers: async (userId, query) => {
          calls.push(["users", userId, query]);
          return { items: [], nextCursor: null };
        },
        listFeedback: async (userId, query) => {
          calls.push(["feedback", userId, query]);
          return { items: [], nextCursor: null };
        },
        updateFeedbackStatus: async (userId, id, body) => {
          calls.push(["patch", userId, id, body]);
          return { id, status: body.status };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const denied = await fetch(`${baseUrl}/get-login-ticket/api/admin/users`);
    assert.equal(denied.status, 401);

    const users = await fetch(`${baseUrl}/get-login-ticket/api/admin/users?q=%E5%8C%97`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(users.status, 200);

    const feedback = await fetch(`${baseUrl}/get-login-ticket/api/admin/feedback?status=new`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(feedback.status, 200);

    const patched = await fetch(`${baseUrl}/get-login-ticket/api/admin/feedback/11111111-2222-4333-8444-555555555555`, {
      method: "PATCH",
      headers: { authorization: "Bearer valid-session", "content-type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    assert.equal(patched.status, 200);
    assert.equal(calls.some((c) => c[0] === "patch"), true);
  });
});

test("omits Access-Control-Allow-Origin so CloudBase gateway does not duplicate it", async () => {
  const server = createHttpServer({ service: null });

  await withServer(server, async (baseUrl) => {
    const options = await fetch(baseUrl, { method: "OPTIONS" });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get("access-control-allow-origin"), null);
    assert.ok(options.headers.get("access-control-allow-methods"));
    assert.ok(options.headers.get("access-control-allow-headers"));

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "fresh-code" }),
    });
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  });
});
