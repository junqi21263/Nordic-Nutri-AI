import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createHttpServer, createRuntimeService, readRuntimeConfig, selectDeepseekModel } from "./index.js";

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
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
  const db = { from: () => ({}) };
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
});

test("maps deprecated DeepSeek aliases to the supported V4 Flash model", () => {
  assert.equal(selectDeepseekModel(undefined), "deepseek-v4-flash");
  assert.equal(selectDeepseekModel("deepseek-chat"), "deepseek-v4-flash");
  assert.equal(selectDeepseekModel("deepseek-reasoner"), "deepseek-v4-flash");
  assert.equal(selectDeepseekModel("deepseek-v4-pro"), "deepseek-v4-pro");
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
        getDailySummary: async (userId, date) => { calls.push(["summary", userId, date]); return { date }; },
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

test("reads and writes persisted coach messages only for the signed-in user", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      coach: {
        getMessages: async (userId) => { calls.push(["read", userId]); return []; },
        sendMessage: async (userId, body) => { calls.push(["write", userId, body]); return { messages: [] }; },
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
  });

  assert.deepEqual(calls.map((call) => call.slice(0, 2)), [["read", "user-1"], ["write", "user-1"]]);
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
