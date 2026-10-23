import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateResult } from "../../cloudbase/functions/get-login-ticket/qwen-vision-service.cjs";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export function scoreRecognition(sample, result) {
  const validated = validateResult(result);
  const names = validated.items.map((x) => x.name.toLowerCase()).join(" ");
  const missing = sample.expected.filter(
    (group) => !group.some((x) => names.includes(x.toLowerCase())),
  );
  const forbidden = sample.forbidden.filter((x) =>
    names.includes(x.toLowerCase()),
  );
  return {
    schemaValid: true,
    expectedGroups: sample.expected.length,
    matchedGroups: sample.expected.length - missing.length,
    missing,
    forbidden,
    automaticChecksPassed: !missing.length && !forbidden.length,
    humanReviewRequired: true,
    nutritionAccuracy: null,
  };
}
export async function verifySamples(manifest, directory) {
  for (const sample of manifest.samples) {
    const data = await readFile(resolve(directory, sample.file));
    if (createHash("sha256").update(data).digest("hex") !== sample.sha256)
      throw new Error(`SAMPLE_HASH_MISMATCH:${sample.id}`);
  }
  return manifest.samples.length;
}
export async function recognize({
  baseUrl,
  token,
  sample,
  bytes,
  request = fetch,
  now = Date.now,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
}) {
  const started = now(),
    requestId = randomUUID();
  const call = async (path, init = {}) => {
    const r = await request(baseUrl + path, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init.headers,
      },
      signal: AbortSignal.timeout(init.method === "POST" ? 35000 : 15000),
    });
    const body = await r.json();
    if (!r.ok)
      throw Object.assign(new Error(body.code || `HTTP_${r.status}`), {
        code: body.code || `HTTP_${r.status}`,
        status: r.status,
      });
    return body;
  };
  let body = await call("/vision-analysis", {
    method: "POST",
    body: JSON.stringify({
      clientRequestId: requestId,
      locale: "zh-CN",
      contentType: "image/jpeg",
      imageBase64: bytes.toString("base64"),
      clientCapabilities: {
        supportsAsyncVision: true,
        clientVersion: "qa-benchmark-v1",
      },
    }),
  });
  const submissionMs = now() - started;
  const deadline = Math.min(
    started + 120000,
    Number.isFinite(Date.parse(body.deadlineAt))
      ? Date.parse(body.deadlineAt)
      : started + 120000,
  );
  while (body.status === "processing") {
    if (now() >= deadline)
      throw Object.assign(new Error("BENCHMARK_DEADLINE_EXPIRED"), {
        code: "BENCHMARK_DEADLINE_EXPIRED",
      });
    await sleep(Math.min(1500, Math.max(0, deadline - now())));
    try {
      body = await call(
        `/vision-analysis/${encodeURIComponent(body.analysisId)}`,
      );
    } catch (error) {
      if (
        error.status >= 500 ||
        error.name === "TimeoutError" ||
        error.name === "TypeError"
      )
        continue;
      throw error;
    }
  }
  if (["failed", "timed_out", "cancelled"].includes(body.status))
    throw Object.assign(new Error(body.errorCode || "VISION_ANALYSIS_FAILED"), {
      code: body.errorCode || "VISION_ANALYSIS_FAILED",
    });
  const result = body.result || body;
  return {
    sampleId: sample.id,
    sha256: sample.sha256,
    requestId,
    analysisId: body.analysisId || result.analysisId,
    submissionMs,
    totalMs: now() - started,
    provider: result.provider,
    model: result.model,
    attempts: result.attempts,
    fallbackUsed: result.fallbackUsed,
    score: scoreRecognition(sample, result),
    result,
  };
}
async function main() {
  const args = process.argv.slice(2);
  const option = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const manifest = JSON.parse(
    await readFile(resolve(root, "scripts/vision/samples.json"), "utf8"),
  );
  const images = resolve(
    option("--images") || resolve(root, ".local/vision-benchmark"),
  );
  await verifySamples(manifest, images);
  if (!args.includes("--run")) {
    console.log(
      JSON.stringify({
        dryRun: true,
        verifiedSamples: manifest.samples.length,
        categories: manifest.samples.map((s) => s.category),
      }),
    );
    return;
  }
  const targets = {
    dev: "test-dev-d4gyxnn0b5dfa2c8a",
    prod: "lewis-healthy-d4glgqqzv73a5bc10",
  };
  const target = option("--target");
  if (!targets[target]) throw new Error("--target dev|prod is required");
  const token = process.env.TEST_PRODUCT_TOKEN_A;
  if (!token)
    throw new Error(
      "TEST_PRODUCT_TOKEN_A is required; do not put a token on the command line",
    );
  const output = resolve(
    option("--output") || resolve(root, ".local/vision-benchmark/results.json"),
  );
  const results = [];
  const report = {
    version: 1,
    target,
    startedAt: new Date().toISOString(),
    results,
    humanReview: "pending",
  };
  await mkdir(dirname(output), { recursive: true });
  for (const sample of manifest.samples) {
    try {
      results.push(
        await recognize({
          baseUrl: `https://${targets[target]}.service.tcloudbase.com/get-login-ticket`,
          token,
          sample,
          bytes: await readFile(resolve(images, sample.file)),
        }),
      );
    } catch (error) {
      results.push({
        sampleId: sample.id,
        errorCode: error.code || error.name || "BENCHMARK_FAILED",
      });
      if (error.status === 401 || error.status === 403) {
        await writeFile(output, JSON.stringify(report, null, 2));
        throw new Error(
          "SESSION_INVALID: log in normally and renew the test session",
        );
      }
    }
    await writeFile(output, JSON.stringify(report, null, 2) + "\n");
    console.log(
      JSON.stringify({
        sample: sample.id,
        completed: !results.at(-1).errorCode,
      }),
    );
  }
  const passed = results.every(
    (r) => !r.errorCode && r.score?.automaticChecksPassed,
  );
  console.log(
    JSON.stringify({
      output,
      automaticChecksPassed: passed,
      humanReviewRequired: true,
    }),
  );
  if (!passed) process.exitCode = 1;
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
