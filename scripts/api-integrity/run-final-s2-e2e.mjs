import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildApiRequest, callApi } from "./http-client.mjs";

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(fs.readFileSync(filePath, "utf8").split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return [];
    const index = trimmed.indexOf("=");
    if (index < 1) return [];
    return [[trimmed.slice(0, index).trim(), trimmed.slice(index + 1).trim().replace(/^(['\"])(.*)\1$/, "$2")]];
  }));
}

function summary(result) {
  const body = result?.body && typeof result.body === "object" ? result.body : {};
  return {
    httpStatus: result?.status ?? null,
    status: body.status ?? null,
    analysisId: body.analysisId ?? null,
    currentStage: body.currentStage ?? body.current_stage ?? null,
    errorCode: body.errorCode ?? body.error_code ?? body.code ?? null,
    providerAttempt: body.providerAttempt ?? body.provider_attempt ?? null,
    dispatchState: body.dispatchState ?? body.dispatch_state ?? null,
    quotaState: body.quotaState ?? body.quota_state ?? null,
  };
}

const config = { ...loadDotEnv(path.resolve("scripts/api-integrity/.env")), ...process.env };
const baseUrl = String(config.API_BASE_URL || "").replace(/\/$/, "");
const token = config.TEST_PRODUCT_TOKEN_A;
const imagePath = path.resolve(config.VISION_TEST_IMAGE_PATH || "/private/tmp/s2-trigger-candidate-d1.jpg");
if (!baseUrl || !token || !fs.existsSync(imagePath)) throw new Error("S2_CONFIG_OR_IMAGE_MISSING");
if (config.PHASE2_AUTH_SMOKE_CONFIRMATION !== "production-auth-smoke") throw new Error("S2_CONFIRMATION_MISSING");

const clientRequestId = config.S2_CLIENT_REQUEST_ID || crypto.randomUUID();
const existingAnalysisId = config.S2_ANALYSIS_ID || null;
const post = existingAnalysisId
  ? { status: 202, body: { status: "processing", analysisId: existingAnalysisId, currentStage: "analyzing" } }
  : await callApi(buildApiRequest({
    baseUrl,
    path: "/vision-analysis",
    method: "POST",
    token,
    body: {
      clientRequestId,
      imageBase64: fs.readFileSync(imagePath).toString("base64"),
      contentType: "image/jpeg",
      source: "album",
      clientCapabilities: { supportsAsyncVision: true },
    },
  }), { timeoutMs: 30_000 });

const history = [{ at: new Date().toISOString(), ...summary(post) }];
let final = post;
let analysisId = post?.body?.analysisId;
if (post.status === 202 && analysisId) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    final = await callApi(buildApiRequest({ baseUrl, path: `/vision-analysis/${analysisId}`, method: "GET", token }), { timeoutMs: 20_000 });
    history.push({ at: new Date().toISOString(), ...summary(final) });
    const currentStatus = final?.body?.status;
    if (["completed", "failed", "timed_out", "cancelled"].includes(currentStatus)) break;
    if ([400, 404, 409, 500, 503].includes(final.status)) break;
  }
}

console.log(JSON.stringify({
  mode: "final-s2-e2e",
  clientRequestId,
  image: { sha256: crypto.createHash("sha256").update(fs.readFileSync(imagePath)).digest("hex"), bytes: fs.statSync(imagePath).size },
  initial: history[0],
  final: history.at(-1),
  samples: history.length,
  terminal: ["completed", "failed", "timed_out", "cancelled"].includes(history.at(-1)?.status),
}, null, 2));

if (post.status !== 202) process.exitCode = 2;
