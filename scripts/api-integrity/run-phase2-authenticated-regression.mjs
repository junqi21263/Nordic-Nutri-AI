import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildApiRequest, callApi } from "./http-client.mjs";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const values = {};
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    values[key] = value;
  }
  return values;
}

function required(values, name) {
  const value = values[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function makeRequestId(label) {
  void label;
  return crypto.randomUUID();
}

function responseSummary(result) {
  const body = result?.body && typeof result.body === "object" ? result.body : {};
  return {
    status: result?.status ?? null,
    businessCode: body.businessCode ?? body.code ?? null,
    analysisId: body.analysisId ?? null,
    statusValue: body.status ?? null,
    currentStage: body.currentStage ?? body.current_stage ?? null,
    quotaState: body.quotaState ?? body.quota_state ?? null,
    providerAttempt: body.providerAttempt ?? body.provider_attempt ?? null,
    dispatchState: body.dispatchState ?? body.dispatch_state ?? null,
    updatedAt: body.updatedAt ?? body.updated_at ?? null,
  };
}

async function call(baseUrl, pathName, method, token, body) {
  return callApi(buildApiRequest({ baseUrl, path: pathName, method, token, body }), { timeoutMs: 20_000 });
}

function assertLegacyResult(label, result) {
  const summary = JSON.stringify(responseSummary(result));
  assert.notEqual(result.status, 202, `${label}: Hybrid must remain disabled; response=${summary}`);
  assert.equal(result.status, 200, `${label}: expected legacy HTTP 200, received ${result.status}; response=${summary}`);
}

const dotenv = loadDotEnv(path.resolve("scripts/api-integrity/.env"));
const config = { ...dotenv, ...process.env };
const baseUrl = required(config, "API_BASE_URL").replace(/\/$/, "");
const tokenA = required(config, "TEST_PRODUCT_TOKEN_A");
const tokenB = required(config, "TEST_PRODUCT_TOKEN_B");
const imagePath = required(config, "VISION_TEST_IMAGE_PATH");
if (config.PHASE2_AUTH_SMOKE_CONFIRMATION !== "production-auth-smoke") {
  throw new Error("PHASE2_AUTH_SMOKE_CONFIRMATION must equal production-auth-smoke");
}

const image = fs.readFileSync(path.resolve(imagePath));
const imageBase64 = image.toString("base64");
const contentType = /^\.png$/i.test(path.extname(imagePath)) ? "image/png" : "image/jpeg";
const results = [];

const a1 = await call(baseUrl, "/vision-analysis", "POST", tokenA, {
  clientRequestId: makeRequestId("a1"),
  imageBase64,
  contentType,
  source: "album",
});
assertLegacyResult("A1", a1);
results.push({ case: "A1", ...responseSummary(a1) });

const a2 = await call(baseUrl, "/vision-analysis", "POST", tokenA, {
  clientRequestId: makeRequestId("a2"),
  imageBase64,
  contentType,
  source: "album",
  clientCapabilities: { supportsAsyncVision: true },
});
assertLegacyResult("A2", a2);
results.push({ case: "A2", ...responseSummary(a2) });

const analysisId = config.TEST_ANALYSIS_ID_A || a1.body?.analysisId;
if (!analysisId) throw new Error("A1 did not return analysisId; set TEST_ANALYSIS_ID_A to a dedicated A analysis ID");

const aGet1 = await call(baseUrl, `/vision-analysis/${analysisId}`, "GET", tokenA);
assert.equal(aGet1.status, 200, `B/A owner GET: expected HTTP 200, received ${aGet1.status}`);
const aGet2 = await call(baseUrl, `/vision-analysis/${analysisId}`, "GET", tokenA);
assert.equal(aGet2.status, 200, `B/A repeated owner GET: expected HTTP 200, received ${aGet2.status}`);
const beforeAfter = [responseSummary(aGet1), responseSummary(aGet2)];
assert.deepEqual(beforeAfter[0], beforeAfter[1], "B/A repeated GET changed the observable analysis state");

const bGet = await call(baseUrl, `/vision-analysis/${analysisId}`, "GET", tokenB);
assert.ok([403, 404].includes(bGet.status), `B/A cross-owner GET must be 403 or 404, received ${bGet.status}`);

results.push({ case: "B-owner-A", ...responseSummary(aGet1) });
results.push({ case: "B-cross-owner", ...responseSummary(bGet) });

console.log(JSON.stringify({
  mode: "phase2-authenticated-regression",
  hybridExpected: "disabled",
  image: { contentType, bytes: image.length },
  results,
}, null, 2));
