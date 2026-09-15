import assert from "node:assert/strict";
import { generateKeyPairSync, createVerify, createHash } from "node:crypto";
import test from "node:test";
import { createFcmPushService, createServiceAccountJwt } from "./push-notification-service.cjs";

function createDb({ tokens = [], deliveryId = "11111111-1111-4111-8111-111111111111", deliveries = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      const state = { table, filters: [] };
      const chain = {
        select(columns) { state.columns = columns; return chain; },
        eq(column, value) { state.filters.push([column, value]); return chain; },
        is(column, value) { state.filters.push([column, value]); return chain; },
        delete() { state.delete = true; return chain; },
        update(payload) { state.update = payload; calls.push({ type: "update", table, payload }); return chain; },
        insert(payload) { state.insert = payload; calls.push({ type: "insert", table, payload }); return chain; },
        in(column, value) { state.filters.push([column, value]); return chain; },
        single: async () => ({ data: { id: deliveryId }, error: null }),
        upsert(payload, options) {
          calls.push({ type: "upsert", table, payload, options });
          return {
            select() { return { single: async () => ({ data: { id: "token-row-1" }, error: null }) }; },
          };
        },
        then(resolve, reject) {
          calls.push({ type: state.delete ? "delete" : state.update ? "update-select" : state.insert ? "insert-select" : "select", table, columns: state.columns, filters: state.filters });
          const isDelete = state.delete;
          return Promise.resolve({
            data: isDelete ? [] : state.update ? (table === "push_delivery_attempts" ? [{ id: deliveryId, status: state.update.status }] : []) : state.insert ? { id: deliveryId } : table === "push_delivery_attempts" ? deliveries : tokens,
            error: null,
          }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

test("registers an Android FCM token without returning the token", async () => {
  const db = createDb();
  const service = createFcmPushService({
    db,
    env: {
      TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
      FCM_PROJECT_ID: "nordic-nutri",
      FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
      FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n",
    },
    now: () => new Date("2026-09-11T08:00:00.000Z"),
  });

  const result = await service.registerToken("user-1", {
    token: "fcm-token-value",
    platform: "android",
    packageName: "com.lewislee.nordicnutri.dev",
  });

  assert.deepEqual(result, { registered: true });
  assert.deepEqual(db.calls[0].payload, {
    user_id: "user-1",
    token: "fcm-token-value",
    platform: "android",
    package_name: "com.lewislee.nordicnutri.dev",
    environment: "test-dev-d4gyxnn0b5dfa2c8a",
    created_at: "2026-09-11T08:00:00.000Z",
    updated_at: "2026-09-11T08:00:00.000Z",
    last_seen_at: "2026-09-11T08:00:00.000Z",
    invalidated_at: null,
  });
});

test("accepts the existing Firebase service-account environment variable names", () => {
  const service = createFcmPushService({
    db: createDb(),
    env: {
      TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
      project_id: "nordic-nutri",
      client_email: "firebase-admin@example.iam.gserviceaccount.com",
      private_key: "-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n",
    },
  });

  assert.equal(service.config.configured, true);
});

test("sends a meal reminder through FCM and returns only safe delivery metadata", async () => {
  const db = createDb({ tokens: [{ id: "token-row-1", token: "device-token-1" }] });
  const requests = [];
  const service = createFcmPushService({
    db,
    env: {
      TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
      FCM_PROJECT_ID: "nordic-nutri",
      FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
      FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n",
    },
    authClientFactory: () => ({ getAccessToken: async () => "oauth-access-token" }),
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ name: "projects/nordic-nutri/messages/message-1" }) };
    },
  });

  const result = await service.sendTest({ userId: "user-1", mealType: "lunch", traceId: "trace-push" });

  assert.deepEqual(result, {
    sent: 1,
    accepted: 1,
    received: null,
    displayed: null,
    opened: null,
    status: "pending",
    invalidated: 0,
    messageIds: ["projects/nordic-nutri/messages/message-1"],
    deliveryIds: ["11111111-1111-4111-8111-111111111111"],
    deliveryId: "11111111-1111-4111-8111-111111111111",
  });
  assert.equal(requests[0].url, "https://fcm.googleapis.com/v1/projects/nordic-nutri/messages:send");
  assert.equal(requests[0].init.headers.Authorization, "Bearer oauth-access-token");
  assert.deepEqual(JSON.parse(requests[0].init.body), {
    message: {
      token: "device-token-1",
      android: {
        priority: "HIGH",
      },
      data: { deliveryId: "11111111-1111-4111-8111-111111111111", traceId: "trace-push", mealType: "lunch", reminder: "1", source: "admin_test", title: "午餐还没记录吗？", body: "拍一下就好 📷" },
    },
  });
});

for (const [scenario, title, body] of [
  ["missed_streak", "最近有点忙？", "不用补齐，从这一餐重新开始就好。"],
  ["recorded_streak", "今天也记一下这一餐 🌿", "你的记录节奏正在慢慢形成。"],
]) {
  test(`sends the ${scenario} reminder copy through the admin whitelist test`, async () => {
    const requests = [];
    const service = createFcmPushService({
      db: createDb({ tokens: [{ id: "token-row-1", token: "device-token-1" }] }),
      env: {
        TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
        FCM_PROJECT_ID: "nordic-nutri",
        FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
        FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n",
      },
      authClientFactory: () => ({ getAccessToken: async () => "oauth-access-token" }),
      fetchImpl: async (_url, init) => {
        requests.push(init);
        return { ok: true, status: 200, json: async () => ({ name: "projects/nordic-nutri/messages/message-1" }) };
      },
    });

    await service.sendTest({ userId: "user-1", mealType: "dinner", scenario, traceId: "trace-push" });

    assert.deepEqual(JSON.parse(requests[0].body).message.data, {
      deliveryId: "11111111-1111-4111-8111-111111111111",
      traceId: "trace-push",
      mealType: "dinner",
      reminder: "1",
      source: "admin_test",
      title,
      body,
    });
  });
}

test("times out an FCM request instead of waiting forever", async () => {
  const db = createDb({ tokens: [{ id: "token-row-1", token: "device-token-1" }] });
  const service = createFcmPushService({
    db,
    env: {
      TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
      FCM_PROJECT_ID: "nordic-nutri",
      FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
      FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n",
    },
    authClientFactory: () => ({ getAccessToken: async () => "oauth-access-token" }),
    fcmRequestTimeoutMs: 5,
    fetchImpl: (_url, init) => new Promise((resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
    }),
  });

  await assert.rejects(
    service.sendTest({ userId: "user-1", mealType: "breakfast" }),
    (error) => error.code === "FCM_TIMEOUT",
  );
});

test("times out FCM authentication instead of waiting forever", async () => {
  const db = createDb({ tokens: [{ id: "token-row-1", token: "device-token-1" }] });
  const service = createFcmPushService({
    db,
    env: {
      TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
      FCM_PROJECT_ID: "nordic-nutri",
      FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com",
      FCM_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\nredacted\\n-----END PRIVATE KEY-----\\n",
    },
    fcmAuthTimeoutMs: 5,
    authClientFactory: async () => new Promise(() => {}),
  });

  await assert.rejects(
    service.sendTest({ userId: "user-1", mealType: "breakfast" }),
    (error) => error.code === "FCM_AUTH_TIMEOUT",
  );
});

test("uses the configured relay without sending the Firebase private key", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const db = createDb({ tokens: [{ id: "token-row-1", token: "device-token-1" }] });
  const requests = [];
  const service = createFcmPushService({
    db,
    env: {
      TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a",
      project_id: "nordic-nutri",
      client_email: "firebase-admin@example.iam.gserviceaccount.com",
      private_key: privateKey.export({ type: "pkcs8", format: "pem" }),
      FCM_RELAY_URL: "https://google-keys-dev.lewislee.online/fcm/send",
      FCM_RELAY_SHARED_SECRET: "relay-secret",
    },
    fetchImpl: async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, json: async () => ({ name: "projects/nordic-nutri/messages/message-1" }) };
    },
  });

  const result = await service.sendTest({ userId: "user-1", mealType: "breakfast" });

  assert.equal(result.sent, 1);
  assert.equal(result.accepted, 1);
  assert.equal(result.status, "pending");
  assert.deepEqual(result.messageIds, ["projects/nordic-nutri/messages/message-1"]);
  assert.equal(requests[0].url, "https://google-keys-dev.lewislee.online/fcm/send");
  assert.equal(requests[0].init.headers["X-FCM-Relay-Secret"], "relay-secret");
  const body = JSON.parse(requests[0].init.body);
  assert.equal(body.projectId, "nordic-nutri");
  assert.equal(body.message.token, "device-token-1");
  assert.equal(body.message.data.title, "早餐还没记录吗？");
  assert.equal(body.privateKey, undefined);
  assert.equal(body.clientEmail, undefined);
  const [header, claims, signature] = body.assertion.split(".");
  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "JWT" });
  const decodedClaims = JSON.parse(Buffer.from(claims, "base64url").toString());
  assert.equal(decodedClaims.iss, "firebase-admin@example.iam.gserviceaccount.com");
  assert.equal(decodedClaims.scope, "https://www.googleapis.com/auth/firebase.messaging");
  assert.equal(decodedClaims.aud, "https://oauth2.googleapis.com/token");
  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${header}.${claims}`);
  verifier.end();
  assert.equal(verifier.verify(publicKey, signature, "base64url"), true);
});

test("rejects an unsupported reminder meal type before sending", async () => {
  const service = createFcmPushService({ db: createDb(), env: {} });
  await assert.rejects(
    service.sendTest({ userId: "user-1", mealType: "brunch" }),
    (error) => error.code === "PUSH_MEAL_TYPE_INVALID",
  );
});

test("acknowledges a device receipt and exposes the delivery state", async () => {
  const deliveryId = "22222222-2222-4222-8222-222222222222";
  const service = createFcmPushService({
    db: createDb({ deliveryId }),
    env: { TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a", FCM_PROJECT_ID: "nordic-nutri", FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com", FCM_PRIVATE_KEY: "key" },
    now: () => new Date("2026-09-11T08:00:00.000Z"),
  });

  const result = await service.acknowledgeDelivery("user-1", { deliveryId, event: "received" });

  assert.deepEqual(result, { acknowledged: true, deliveryId, event: "received", status: "received" });
});

test("accepts a native receipt only when the FCM token proof matches the delivery", async () => {
  const deliveryId = "33333333-3333-4333-8333-333333333333";
  const token = "device-token-native";
  const db = createDb({ deliveryId });
  const service = createFcmPushService({
    db,
    env: { TCB_ENV: "test-dev-d4gyxnn0b5dfa2c8a", FCM_PROJECT_ID: "nordic-nutri", FCM_CLIENT_EMAIL: "firebase-admin@example.iam.gserviceaccount.com", FCM_PRIVATE_KEY: "key" },
    now: () => new Date("2026-09-11T08:00:00.000Z"),
  });

  const result = await service.acknowledgeNativeDelivery({ deliveryId, event: "displayed", token });

  assert.deepEqual(result, { acknowledged: true, deliveryId, event: "displayed", status: "displayed" });
  const update = db.calls.find((call) => call.type === "update");
  assert.ok(update);
  assert.deepEqual(update.payload, {
    status: "displayed",
    last_event: "displayed",
    last_event_at: "2026-09-11T08:00:00.000Z",
    displayed_at: "2026-09-11T08:00:00.000Z",
  });
  const select = db.calls.find((call) => call.type === "update-select");
  assert.ok(select?.filters.some(([column, value]) => column === "token_hash" && value === createHash("sha256").update(token).digest("hex")));
});
