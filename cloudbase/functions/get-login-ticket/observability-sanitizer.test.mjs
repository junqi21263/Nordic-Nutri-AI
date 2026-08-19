import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeAuditSnapshot, sanitizeTraceMeta } from "./observability-sanitizer.cjs";

test("audit snapshots keep allowlisted scalar fields only", () => {
  assert.deepEqual(
    sanitizeAuditSnapshot({ name: "鸡蛋", status: "published", token: "secret", imageUrl: "https://secret" }),
    { name: "鸡蛋", status: "published" },
  );
});

test("trace diagnostics keep image, request, and provider timing fields", () => {
  assert.deepEqual(
    sanitizeTraceMeta({
      source: "camera",
      originalContentType: "image/heic",
      finalContentType: "image/jpeg",
      originalBytes: 4000000,
      finalBytes: 700000,
      originalWidth: 3024,
      originalHeight: 4032,
      finalWidth: 1280,
      finalHeight: 1706,
      orientation: "right-top",
      imagePrepareDurationMs: 420,
      objectSize: 700000,
      tempUrlGenerationMs: 120,
      requestTotalDurationMs: 6005,
      remainingBudgetMs: 6495,
      timeoutBudgetMs: 6000,
      providerHttpStatus: 200,
      providerRequestIdHash: "a".repeat(64),
      providerErrorCode: "timeout",
      providerErrorType: "abort",
      prompt: "must not persist",
    }),
    {
      source: "camera",
      originalContentType: "image/heic",
      finalContentType: "image/jpeg",
      originalBytes: 4000000,
      finalBytes: 700000,
      originalWidth: 3024,
      originalHeight: 4032,
      finalWidth: 1280,
      finalHeight: 1706,
      orientation: "right-top",
      imagePrepareDurationMs: 420,
      objectSize: 700000,
      tempUrlGenerationMs: 120,
      requestTotalDurationMs: 6005,
      remainingBudgetMs: 6495,
      timeoutBudgetMs: 6000,
      providerHttpStatus: 200,
      providerRequestIdHash: "a".repeat(64),
      providerErrorCode: "timeout",
      providerErrorType: "abort",
    },
  );
});
