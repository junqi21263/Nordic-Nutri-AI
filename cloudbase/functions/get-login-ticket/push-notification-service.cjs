const { createHash, createSign } = require("node:crypto");

const ANDROID_PACKAGE = "com.lewislee.nordicnutri.dev";
const FCM_SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const FCM_OAUTH_AUDIENCE = "https://oauth2.googleapis.com/token";
const FCM_ENDPOINT = "https://fcm.googleapis.com/v1/projects";
const FCM_REQUEST_TIMEOUT_MS = 15_000;
const FCM_AUTH_TIMEOUT_MS = 8_000;
const MEAL_TYPES = new Set(["breakfast", "lunch", "dinner"]);
const MEAL_LABELS = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" };
const TEST_SCENARIOS = new Set(["meal", "missed_streak", "recorded_streak"]);
const DELIVERY_EVENTS = new Set(["received", "displayed", "opened"]);

class PushNotificationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "PushNotificationError";
    this.code = code;
  }
}

function requiredString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMealType(value) {
  const mealType = requiredString(value).toLowerCase();
  if (!MEAL_TYPES.has(mealType)) throw new PushNotificationError("PUSH_MEAL_TYPE_INVALID", "提醒餐次无效");
  return mealType;
}

function normalizeTestScenario(value) {
  const scenario = requiredString(value).toLowerCase() || "meal";
  if (!TEST_SCENARIOS.has(scenario)) throw new PushNotificationError("PUSH_SCENARIO_INVALID", "测试推送场景无效");
  return scenario;
}

function getTestReminderCopy(mealType, scenario) {
  if (scenario === "missed_streak") {
    return { title: "最近有点忙？", body: "不用补齐，从这一餐重新开始就好。" };
  }
  if (scenario === "recorded_streak") {
    return { title: "今天也记一下这一餐 🌿", body: "你的记录节奏正在慢慢形成。" };
  }
  return { title: `${MEAL_LABELS[mealType]}还没记录吗？`, body: "拍一下就好 📷" };
}

function normalizeUserId(value) {
  const userId = requiredString(value);
  if (!userId || userId.length > 128) throw new PushNotificationError("PUSH_USER_ID_INVALID", "用户 ID 无效");
  return userId;
}

function normalizeToken(value) {
  const token = requiredString(value);
  if (!token || token.length > 4096) throw new PushNotificationError("PUSH_TOKEN_INVALID", "推送 token 无效");
  return token;
}

function normalizeDeliveryId(value) {
  const deliveryId = requiredString(value);
  if (!/^[0-9a-f-]{36}$/i.test(deliveryId)) {
    throw new PushNotificationError("PUSH_DELIVERY_ID_INVALID", "推送回执 ID 无效");
  }
  return deliveryId;
}

function normalizeDeliveryEvent(value) {
  const event = requiredString(value).toLowerCase();
  if (!DELIVERY_EVENTS.has(event)) {
    throw new PushNotificationError("PUSH_DELIVERY_EVENT_INVALID", "推送回执事件无效");
  }
  return event;
}

function tokenHash(token) {
  return createHash("sha256").update(token).digest("hex");
}

function createDefaultAuthClient({ clientEmail, privateKey }) {
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({
    credentials: { client_email: clientEmail, private_key: privateKey },
    scopes: [FCM_SCOPE],
  });
  return auth.getClient();
}

function base64UrlJson(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createServiceAccountJwt({ clientEmail, privateKey, now = () => new Date() }) {
  const issuedAt = Math.floor(now().getTime() / 1000);
  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const claims = base64UrlJson({
    iss: clientEmail,
    scope: FCM_SCOPE,
    aud: FCM_OAUTH_AUDIENCE,
    iat: issuedAt,
    exp: issuedAt + 3600,
  });
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${signer.sign(privateKey).toString("base64url")}`;
}

function normalizeRelayUrl(value) {
  try {
    const url = new URL(requiredString(value));
    if (url.protocol !== "https:" || url.search || url.hash) return "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return "";
  }
}

function getFcmConfig(env) {
  const projectId = requiredString(env.FCM_PROJECT_ID || env.project_id);
  const clientEmail = requiredString(env.FCM_CLIENT_EMAIL || env.client_email);
  const privateKey = requiredString(env.FCM_PRIVATE_KEY || env.private_key).replace(/\\n/g, "\n");
  return {
    projectId,
    clientEmail,
    privateKey,
    packageName: requiredString(env.FCM_ANDROID_PACKAGE) || ANDROID_PACKAGE,
    environment: requiredString(env.TCB_ENV),
    relayUrl: normalizeRelayUrl(env.FCM_RELAY_URL),
    relaySharedSecret: requiredString(env.FCM_RELAY_SHARED_SECRET),
    configured: Boolean(projectId && clientEmail && privateKey),
  };
}

function safeErrorCode(error) {
  const message = String(error?.message || "");
  return error?.code || (message.includes("UNREGISTERED") ? "UNREGISTERED" : "FCM_SEND_FAILED");
}

function isUnregisteredResponse(body) {
  return body?.error?.details?.some((detail) => detail?.errorCode === "UNREGISTERED")
    || body?.error?.status === "NOT_FOUND"
    || body?.error?.status === "UNREGISTERED";
}

function fetchWithTimeout(fetchImpl, url, options, {
  timeoutMs = FCM_REQUEST_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  AbortControllerImpl = globalThis.AbortController,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof AbortControllerImpl !== "function") {
    return fetchImpl(url, options);
  }
  const controller = new AbortControllerImpl();
  const timer = setTimeoutImpl(() => controller.abort(), timeoutMs);
  return Promise.resolve()
    .then(() => fetchImpl(url, { ...options, signal: controller.signal }))
    .finally(() => clearTimeoutImpl(timer));
}

function promiseWithTimeout(operation, {
  timeoutMs,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  timeoutError,
} = {}) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || typeof setTimeoutImpl !== "function") {
    return Promise.resolve().then(operation);
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeoutImpl(() => reject(timeoutError()), timeoutMs);
    Promise.resolve()
      .then(operation)
      .then(resolve, reject)
      .finally(() => clearTimeoutImpl(timer));
  });
}

function createFcmPushService({
  db,
  env = process.env,
  fetchImpl = globalThis.fetch,
  authClientFactory,
  now = () => new Date(),
  fcmRequestTimeoutMs = FCM_REQUEST_TIMEOUT_MS,
  fcmAuthTimeoutMs = FCM_AUTH_TIMEOUT_MS,
  setTimeoutImpl = globalThis.setTimeout,
  clearTimeoutImpl = globalThis.clearTimeout,
  AbortControllerImpl = globalThis.AbortController,
}) {
  const config = getFcmConfig(env);
  const authFactory = authClientFactory || (() => createDefaultAuthClient(config));
  const rows = async (query) => {
    const result = await query;
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    return result?.data;
  };

  async function registerToken(userIdInput, input) {
    const userId = normalizeUserId(userIdInput);
    const token = normalizeToken(input?.token);
    const platform = requiredString(input?.platform).toLowerCase();
    const packageName = requiredString(input?.packageName);
    if (platform !== "android" || packageName !== config.packageName) {
      throw new PushNotificationError("PUSH_CLIENT_INVALID", "推送客户端无效");
    }
    if (!config.environment) throw new PushNotificationError("PUSH_ENV_INVALID", "推送环境无效");
    const timestamp = now().toISOString();
    const result = await db.from("device_push_tokens").upsert({
      user_id: userId,
      token,
      platform,
      package_name: packageName,
      environment: config.environment,
      created_at: timestamp,
      updated_at: timestamp,
      last_seen_at: timestamp,
      invalidated_at: null,
    }, { onConflict: "token" });
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    return { registered: true };
  }

  async function unregisterToken(userIdInput, input) {
    const userId = normalizeUserId(userIdInput);
    const token = normalizeToken(input?.token);
    const result = await db.from("device_push_tokens")
      .delete()
      .eq("user_id", userId)
      .eq("token", token)
      .select("id");
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    return { removed: Array.isArray(result.data) && result.data.length > 0 };
  }

  async function listActiveTokens(userId) {
    return rows(db.from("device_push_tokens")
      .select("id,token")
      .eq("user_id", userId)
      .eq("platform", "android")
      .eq("package_name", config.packageName)
      .eq("environment", config.environment)
      .is("invalidated_at", null));
  }

  async function removeToken(id) {
    const result = await db.from("device_push_tokens").delete().eq("id", id);
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
  }

  async function createDeliveryAttempt({ userId, tokenId, token, mealType, traceId, nowIso }) {
    const result = await db.from("push_delivery_attempts").insert({
      user_id: userId,
      token_id: tokenId,
      token_hash: tokenHash(token),
      trace_id: requiredString(traceId) || null,
      meal_type: mealType,
      status: "pending",
      created_at: nowIso,
      expires_at: new Date(new Date(nowIso).getTime() + 60_000).toISOString(),
    }).select("id").single();
    if (result?.error || !result?.data?.id) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    return result.data.id;
  }

  async function updateDeliveryAttempt(deliveryId, payload) {
    const result = await db.from("push_delivery_attempts")
      .update(payload)
      .eq("id", deliveryId)
      .select("id");
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
  }

  async function sendReminder({ userId: userIdInput, mealType: mealTypeInput, copy, source = "scheduled", traceId = null }) {
    const userId = normalizeUserId(userIdInput);
    const mealType = normalizeMealType(mealTypeInput);
    const safeCopy = {
      title: requiredString(copy?.title),
      body: requiredString(copy?.body),
    };
    if (!safeCopy.title || !safeCopy.body) throw new PushNotificationError("PUSH_COPY_INVALID", "推送文案无效");
    if (!config.configured) throw new PushNotificationError("FCM_NOT_CONFIGURED", "FCM 服务端凭证未配置");
    if (typeof fetchImpl !== "function") throw new PushNotificationError("FCM_UNAVAILABLE");
    const tokens = (await listActiveTokens(userId)).filter((row) => requiredString(row?.token));
    if (!tokens.length) return {
      sent: 0,
      accepted: 0,
      received: null,
      displayed: null,
      opened: null,
      status: "no_active_token",
      invalidated: 0,
      messageIds: [],
      deliveryIds: [],
      deliveryId: null,
    };
    const useRelay = Boolean(config.relayUrl && config.relaySharedSecret);
    let accessToken = "";
    let assertion = "";
    if (useRelay) {
      assertion = createServiceAccountJwt({ clientEmail: config.clientEmail, privateKey: config.privateKey, now });
    } else {
      const authTimeoutError = () => new PushNotificationError("FCM_AUTH_TIMEOUT", "FCM 鉴权请求超时");
      const client = await promiseWithTimeout(() => authFactory(), {
        timeoutMs: fcmAuthTimeoutMs,
        setTimeoutImpl,
        clearTimeoutImpl,
        timeoutError: authTimeoutError,
      });
      const accessTokenResult = await promiseWithTimeout(() => client.getAccessToken(), {
        timeoutMs: fcmAuthTimeoutMs,
        setTimeoutImpl,
        clearTimeoutImpl,
        timeoutError: authTimeoutError,
      });
      accessToken = requiredString(typeof accessTokenResult === "string" ? accessTokenResult : accessTokenResult?.token);
      if (!accessToken) throw new PushNotificationError("FCM_AUTH_FAILED");
    }
    const messageIds = [];
    const deliveryIds = [];
    let invalidated = 0;
    for (const row of tokens) {
      const deliveryId = await createDeliveryAttempt({
        userId,
        tokenId: row.id,
        token: row.token,
        mealType,
        traceId,
        nowIso: now().toISOString(),
      });
      deliveryIds.push(deliveryId);
      let response;
      try {
        response = await fetchWithTimeout(fetchImpl, useRelay ? config.relayUrl : `${FCM_ENDPOINT}/${encodeURIComponent(config.projectId)}/messages:send`, {
          method: "POST",
          headers: useRelay
            ? { "X-FCM-Relay-Secret": config.relaySharedSecret, "Content-Type": "application/json" }
            : { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(useRelay
            ? {
                projectId: config.projectId,
                assertion,
                message: {
                  token: row.token,
                  android: {
                    priority: "HIGH",
                  },
                  data: { deliveryId, traceId: requiredString(traceId), mealType, reminder: "1", source, title: safeCopy.title, body: safeCopy.body },
                },
              }
            : {
              message: {
                token: row.token,
                android: {
                  priority: "HIGH",
                },
                data: { deliveryId, traceId: requiredString(traceId), mealType, reminder: "1", source, title: safeCopy.title, body: safeCopy.body },
              },
            }),
        }, { timeoutMs: fcmRequestTimeoutMs, setTimeoutImpl, clearTimeoutImpl, AbortControllerImpl });
      } catch (error) {
        if (error?.name === "AbortError") throw new PushNotificationError("FCM_TIMEOUT", "FCM 请求超时");
        throw new PushNotificationError("FCM_UNAVAILABLE", "FCM 服务暂时不可用");
      }
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        if (body?.name) messageIds.push(body.name);
        await updateDeliveryAttempt(deliveryId, {
          status: "accepted",
          accepted_at: now().toISOString(),
          fcm_message_id: body?.name || null,
          last_event: "accepted",
          last_event_at: now().toISOString(),
        });
        continue;
      }
      if (response.status === 404 || isUnregisteredResponse(body)) {
        await removeToken(row.id);
        await updateDeliveryAttempt(deliveryId, {
          status: "invalidated",
          last_event: "invalidated",
          last_event_at: now().toISOString(),
        });
        invalidated += 1;
        continue;
      }
      throw new PushNotificationError("FCM_SEND_FAILED", safeErrorCode(body?.error || body));
    }
    return {
      sent: messageIds.length,
      accepted: messageIds.length,
      received: null,
      displayed: null,
      opened: null,
      status: messageIds.length ? "pending" : "failed",
      invalidated,
      messageIds,
      deliveryIds,
      deliveryId: deliveryIds.length === 1 ? deliveryIds[0] : null,
    };
  }

  async function sendTest({ userId, mealType, scenario: scenarioInput, traceId = null }) {
    const normalizedMealType = normalizeMealType(mealType);
    const scenario = normalizeTestScenario(scenarioInput);
    return sendReminder({
      userId,
      mealType: normalizedMealType,
      copy: getTestReminderCopy(normalizedMealType, scenario),
      source: "admin_test",
      traceId,
    });
  }

  async function acknowledgeDelivery(userIdInput, { deliveryId: deliveryIdInput, event: eventInput }) {
    const userId = normalizeUserId(userIdInput);
    const deliveryId = normalizeDeliveryId(deliveryIdInput);
    const event = normalizeDeliveryEvent(eventInput);
    const timestamp = now().toISOString();
    const status = event === "opened" ? "opened" : event === "displayed" ? "displayed" : "received";
    const payload = {
      status,
      last_event: event,
      last_event_at: timestamp,
      ...(event === "received" ? { received_at: timestamp } : {}),
      ...(event === "displayed" ? { displayed_at: timestamp } : {}),
      ...(event === "opened" ? { opened_at: timestamp } : {}),
    };
    const result = await db.from("push_delivery_attempts")
      .update(payload)
      .eq("id", deliveryId)
      .eq("user_id", userId)
      .in("status", ["accepted", "received", "displayed"])
      .select("id,status");
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    const acknowledged = Array.isArray(result?.data) && result.data.length > 0;
    return { acknowledged, deliveryId, event, status: acknowledged ? status : "not_found" };
  }

  async function acknowledgeNativeDelivery({ deliveryId: deliveryIdInput, event: eventInput, token: tokenInput }) {
    const deliveryId = normalizeDeliveryId(deliveryIdInput);
    const event = normalizeDeliveryEvent(eventInput);
    const token = normalizeToken(tokenInput);
    const timestamp = now().toISOString();
    const status = event === "opened" ? "opened" : event === "displayed" ? "displayed" : "received";
    const payload = {
      status,
      last_event: event,
      last_event_at: timestamp,
      ...(event === "received" ? { received_at: timestamp } : {}),
      ...(event === "displayed" ? { displayed_at: timestamp } : {}),
      ...(event === "opened" ? { opened_at: timestamp } : {}),
    };
    const result = await db.from("push_delivery_attempts")
      .update(payload)
      .eq("id", deliveryId)
      .eq("token_hash", tokenHash(token))
      .in("status", ["accepted", "received", "displayed"])
      .select("id,status");
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    const acknowledged = Array.isArray(result?.data) && result.data.length > 0;
    return { acknowledged, deliveryId, event, status: acknowledged ? status : "not_found" };
  }

  async function getDeliveryStatus(deliveryIdInput) {
    const deliveryId = normalizeDeliveryId(deliveryIdInput);
    const result = await db.from("push_delivery_attempts")
      .select("id,trace_id,meal_type,status,accepted_at,received_at,displayed_at,opened_at,created_at,expires_at")
      .eq("id", deliveryId)
      .limit(1);
    if (result?.error) throw new PushNotificationError("PUSH_DATABASE_FAILED");
    const row = Array.isArray(result?.data) ? result.data[0] : null;
    if (!row) return null;
    const nowMs = Date.now();
    const expired = ["pending", "accepted"].includes(row.status)
      && Number.isFinite(new Date(row.expires_at).getTime())
      && new Date(row.expires_at).getTime() <= nowMs;
    return {
      deliveryId: row.id,
      traceId: row.trace_id || null,
      mealType: row.meal_type,
      status: expired ? "timeout" : row.status,
      accepted: row.accepted_at ? 1 : 0,
      received: row.received_at ? 1 : expired ? 0 : null,
      displayed: row.displayed_at ? 1 : expired ? 0 : null,
      opened: row.opened_at ? 1 : null,
      createdAt: row.created_at || null,
      expiresAt: row.expires_at || null,
    };
  }

  return { registerToken, unregisterToken, sendReminder, sendTest, acknowledgeDelivery, acknowledgeNativeDelivery, getDeliveryStatus, config: { packageName: config.packageName, environment: config.environment, configured: config.configured, relayConfigured: Boolean(config.relayUrl && config.relaySharedSecret) } };
}

module.exports = { ANDROID_PACKAGE, FCM_AUTH_TIMEOUT_MS, FCM_REQUEST_TIMEOUT_MS, PushNotificationError, createFcmPushService, createServiceAccountJwt, normalizeMealType };
