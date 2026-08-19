const crypto = require("node:crypto");
const { createDiagnosticRecorder } = require("./diagnostic-client.cjs");

const DISPATCH_PATH = "/api/internal/vision-analysis/dispatch";
const DEFAULT_WORKER_NAME = "vision-analysis-worker";
const DEFAULT_INVOKE_TIMEOUT_MS = 55_000;
const DEFAULT_INVOKE_CONCURRENCY = 3;

function makeSignature(secret, { timestamp, method = "POST", path, body }) {
  return crypto.createHmac("sha256", String(secret || ""))
    .update(`${timestamp}\n${method}\n${path}\n${body}`)
    .digest("hex");
}

function getDispatchUrl(endpoint) {
  const base = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("VISION_DISPATCH_CONFIG_MISSING");
  return `${base}${DISPATCH_PATH}`;
}

async function dispatchOnce({
  endpoint = process.env.VISION_ANALYSIS_DISPATCH_API_BASE_URL,
  secret = process.env.VISION_ANALYSIS_DISPATCH_SECRET || process.env.AI_WORKER_SHARED_SECRET,
  maxItems = process.env.VISION_ANALYSIS_DISPATCH_MAX_ITEMS,
  now = () => Date.now(),
  request = globalThis.fetch,
  invokeWorker = null,
  invokeConcurrency = process.env.VISION_ANALYSIS_DISPATCH_CONCURRENCY,
  recordDiagnostic = null,
  runId = crypto.randomUUID(),
} = {}) {
  if (!secret || typeof request !== "function") throw new Error("VISION_DISPATCH_CONFIG_MISSING");
  const configuredMaxItems = Math.min(Math.max(Number(maxItems) || 5, 1), 20);
  const configuredConcurrency = Math.min(Math.max(Number(invokeConcurrency) || DEFAULT_INVOKE_CONCURRENCY, 1), 20);
  const claimLimit = typeof invokeWorker === "function"
    ? Math.min(configuredMaxItems, configuredConcurrency)
    : configuredMaxItems;
  const body = JSON.stringify({ maxItems: claimLimit });
  const timestamp = String(Math.floor(now() / 1000));
  const signature = makeSignature(secret, { timestamp, path: DISPATCH_PATH, body });
  const response = await request(getDispatchUrl(endpoint), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vision-dispatch-timestamp": timestamp,
      "x-vision-dispatch-signature": signature,
    },
    body,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`VISION_DISPATCH_HTTP_${response.status}`);
  const payload = JSON.parse(raw || "{}");
  const jobs = dedupeJobs(Array.isArray(payload.jobs) ? payload.jobs : []);
  await Promise.all(jobs.map((job) => Promise.resolve(recordDiagnostic?.({
    stage: "dispatcher.claim",
    status: "succeeded",
    runId,
    analysisId: job.id || null,
    jobId: job.job_id || null,
    version: job.version ?? null,
    leaseUntil: job.lease_until || null,
  })).catch(() => {})));
  if (!jobs.length || typeof invokeWorker !== "function") {
    return { ...payload, claimed: Number(payload.claimed ?? jobs.length), invoked: 0, errors: [] };
  }
  const concurrency = Math.min(configuredConcurrency, jobs.length);
  const outcomes = await mapWithConcurrency(jobs, concurrency, async (job) => {
    const invocation = toWorkerInvocation(job);
    await Promise.resolve(recordDiagnostic?.({ stage: "dispatcher.worker_invoke_start", status: "started", runId, ...invocation })).catch(() => {});
    try {
      const result = await invokeWorker(invocation);
      await Promise.resolve(recordDiagnostic?.({ stage: "dispatcher.worker_invoke_result", status: "succeeded", runId, ...invocation })).catch(() => {});
      return result;
    } catch (error) {
      await Promise.resolve(recordDiagnostic?.({ stage: "dispatcher.worker_invoke_result", status: "failed", runId, ...invocation, errorCode: safeErrorCode(error) })).catch(() => {});
      throw error;
    }
  });
  const errors = [];
  let invoked = 0;
  outcomes.forEach((outcome, index) => {
    if (outcome.status === "fulfilled") {
      invoked += 1;
      return;
    }
    errors.push({
      analysisId: jobs[index].id || null,
      jobId: jobs[index].job_id || null,
      code: safeErrorCode(outcome.reason),
    });
  });
  return { ...payload, claimed: Number(payload.claimed ?? jobs.length), invoked, errors };
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= items.length) return;
      try {
        results[index] = { status: "fulfilled", value: await mapper(items[index], index) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

function toWorkerInvocation(job = {}) {
  return {
    analysisId: job.id || null,
    jobId: job.job_id || null,
    version: Number.isFinite(Number(job.version)) ? Number(job.version) : null,
    leaseUntil: job.lease_until || null,
  };
}

function dedupeJobs(jobs) {
  const seen = new Set();
  return jobs.filter((job) => {
    const key = `${job.id || ""}:${job.version ?? ""}`;
    if (!job.id || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function safeErrorCode(error) {
  const code = typeof error?.code === "string" ? error.code : "WORKER_INVOKE_FAILED";
  return /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : "WORKER_INVOKE_FAILED";
}

function createCloudbaseWorkerInvoker({
  env = process.env,
  cloudbaseNodeSdk,
  workerName = env.VISION_ANALYSIS_WORKER_FUNCTION_NAME || DEFAULT_WORKER_NAME,
  qualifier = env.VISION_ANALYSIS_WORKER_FUNCTION_QUALIFIER || "$LATEST",
  timeoutMs = Number(env.VISION_ANALYSIS_WORKER_INVOKE_TIMEOUT_MS) || DEFAULT_INVOKE_TIMEOUT_MS,
} = {}) {
  const sdk = cloudbaseNodeSdk || require("@cloudbase/node-sdk");
  const configuredEnv = env.TCB_ENV || env.CLOUDBASE_ENV_ID || env.ENV_ID;
  const app = sdk.init(configuredEnv
    ? { env: configuredEnv }
    : (sdk.SYMBOL_CURRENT_ENV ? { env: sdk.SYMBOL_CURRENT_ENV } : {}));
  return async (job) => {
    const invocation = app.callFunction({ name: workerName, qualifier, data: job }, { timeout: timeoutMs });
    let timer;
    try {
      return await Promise.race([
        invocation,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Object.assign(new Error("worker invocation timed out"), { code: "WORKER_INVOKE_TIMEOUT" })), timeoutMs);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
}

async function main({ enabled = process.env.VISION_ASYNC_FOUNDATION_ENABLED === "true" } = {}) {
  if (!enabled) return { skipped: true, reason: "feature_disabled" };
  return dispatchOnce({ invokeWorker: createCloudbaseWorkerInvoker(), recordDiagnostic: createDiagnosticRecorder() });
}

exports.DISPATCH_PATH = DISPATCH_PATH;
exports.makeSignature = makeSignature;
exports.getDispatchUrl = getDispatchUrl;
exports.dispatchOnce = dispatchOnce;
exports.createCloudbaseWorkerInvoker = createCloudbaseWorkerInvoker;
exports.main = main;
