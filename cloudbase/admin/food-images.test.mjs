import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("./food-images.html", import.meta.url);

async function pageSource() {
  return readFile(pagePath, "utf8");
}

test("batch rail contains no unused operation area", async () => {
  const source = await pageSource();
  assert.doesNotMatch(source, /id="batchActions"/);
  assert.doesNotMatch(source, /function renderBatchActions\(/);
});

test("candidate card content uses a vertical layout with a separate action row", async () => {
  const source = await pageSource();
  assert.match(source, /\.food-card-body \{ display: grid;/);
  assert.match(source, /\.food-card-toolbar \{ display: flex;/);
  assert.match(source, /data-candidate-select=/);
});

test("desktop inspector remains visible while the review queue scrolls", async () => {
  const source = await pageSource();
  assert.match(source, /\.review-inspector \{[^}]*position: sticky;[^}]*top: 16px;/);
  assert.match(source, /\.ops-workspace \{[^}]*overflow: visible;/);
  assert.match(source, /@media \(max-width: 1160px\)[\s\S]*?\.review-inspector \{[^}]*position: static;/);
});

test("batch progress is a fixed-height block instead of an inline control", async () => {
  const source = await pageSource();
  assert.match(source, /\.mini-progress \{ display: block; height: 5px;/);
  assert.match(source, /\.mini-progress > i \{ display: block; height: 5px;/);
});

test("approved batch items are labelled as approved in the all-items view", async () => {
  const source = await pageSource();
  assert.match(source, /completed: "已通过"/);
});

test("category-based batch creation replaces manual food and job identifiers", async () => {
  const source = await pageSource();
  assert.match(source, /id="batchCategory"/);
  assert.match(source, /id="batchCountInput"/);
  assert.match(source, /id="createCategoryBatch"/);
  assert.match(source, /\/food-image-batches\/preview/);
  assert.doesNotMatch(source, /id="foodId"/);
  assert.doesNotMatch(source, /id="jobId"/);
  assert.doesNotMatch(source, /id="createFirstSample"/);
  assert.doesNotMatch(source, /autoRun|runAutoWorker|toggleAutoWorker/);
});

test("active batch controls only expose lifecycle actions, not browser-side workers", async () => {
  const source = await pageSource();
  assert.match(source, /id="startBatch"/);
  assert.match(source, /id="pauseBatch"/);
  assert.match(source, /id="resumeBatch"/);
  assert.doesNotMatch(source, /id="runWorker"/);
});

test("batch workspace exposes status transitions and scheduler guidance", async () => {
  const source = await pageSource();
  assert.match(source, /id="batchStatusPanel"/);
  assert.match(source, /id="schedulerHint"/);
  assert.match(source, /function renderBatchStatusPanel\(/);
  assert.match(source, /云端调度中/);
});

test("review operators can filter retryable items and inspect batch item failures", async () => {
  const source = await pageSource();
  assert.match(source, /data-filter="needs_retry"/);
  assert.match(source, /item\.errorCode/);
  assert.match(source, /item\.retryReason/);
  assert.match(source, /item\.nextRetryAt/);
});

test("API failures are retained in the visible operation feed with request metadata", async () => {
  const source = await pageSource();
  assert.match(source, /id="operationFeed"/);
  assert.match(source, /function createApiError\(/);
  assert.match(source, /function recordOperation\(/);
  assert.match(source, /endpoint, method/);
});

test("admin connection defaults to the primary CloudBase HTTP function", async () => {
  const source = await pageSource();
  assert.match(source, /const DEFAULT_API_BASE = "https:\/\/lewis-healthy-d4glgqqzv73a5bc10\.service\.tcloudbase\.com\/get-login-ticket"/);
  assert.match(source, /\$\("baseUrl"\)\.value = DEFAULT_API_BASE/);
});

test("review queue supports selectable batch approval and an operator workflow guide", async () => {
  const source = await pageSource();
  assert.match(source, /id="workflowGuide"/);
  assert.match(source, /id="selectAllReview"/);
  assert.match(source, /id="approveSelected"/);
  assert.match(source, /state\.selectedImageIds/);
  assert.match(source, /async function approveSelectedImages\(/);
});

test("category preview exposes a clickable selected-food panel instead of a count only", async () => {
  const source = await pageSource();
  assert.match(source, /id="selectionPreviewPanel"/);
  assert.match(source, /function renderSelectionPreview\(/);
  assert.match(source, /data-preview-food-id=/);
});

test("rejecting a candidate triggers its server-controlled retry and carries the review reason", async () => {
  const source = await pageSource();
  assert.match(source, /重试任务已提交/);
  assert.match(source, /retryScheduled/);
});
