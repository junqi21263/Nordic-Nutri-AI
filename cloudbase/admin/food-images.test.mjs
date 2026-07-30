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

test("batch creation explicitly selects one reusable visual state", async () => {
  const source = await pageSource();
  assert.match(source, /id="visualProfileKey"/);
  assert.match(source, /value="raw">生鲜原料/);
  assert.match(source, /value="cooked_plain">清淡熟制/);
  assert.match(source, /visualProfileKey, selectionSource: "category"/);
  assert.match(source, /视觉状态：/);
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

test("category preview keeps count and selection aligned with the server-filtered candidate pool", async () => {
  const source = await pageSource();
  assert.match(source, /previewLoaded/);
  assert.match(source, /excludedReadyCount/);
  assert.match(source, /已剔除/);
  assert.match(source, /batchCountInput"\)\.value = String\(selectedCount\)/);
  assert.match(source, /state\.previewRequestedCount === batchCount\(\)/);
  assert.match(source, /\$\("visualProfileKey"\)\.onchange = previewCategory/);
});

test("rejecting a candidate triggers its server-controlled retry and carries the review reason", async () => {
  const source = await pageSource();
  assert.match(source, /重试任务已提交/);
  assert.match(source, /retryScheduled/);
});

test("queue summary drops the hero review count and keeps left-aligned progress copy", async () => {
  const source = await pageSource();
  assert.doesNotMatch(source, /id="reviewCount"/);
  assert.doesNotMatch(source, /class="summary-number"/);
  assert.match(source, /id="reviewCopy"/);
  assert.match(source, /\.queue-summary \{ display: flex;[^}]*justify-content: flex-start;/);
});

test("all-items filter is the leftmost queue filter control", async () => {
  const source = await pageSource();
  assert.match(source, /id="filterRow"[\s\S]*?data-filter="all"[\s\S]*?data-filter="needs_review"/);
});

test("candidate cards keep a bare checkbox without repeating batch-select wording", async () => {
  const source = await pageSource();
  assert.match(source, /data-candidate-select=/);
  assert.doesNotMatch(source, /批量选择<\/label>/);
  assert.doesNotMatch(source, /card-select-label[\s\S]{0,120}批量/);
});

test("retryable failed items expose an immediate retry action", async () => {
  const source = await pageSource();
  assert.match(source, /立即重试/);
  assert.match(source, /food-image-jobs\/\$\{[^}]+\}\/retry|\/food-image-jobs\/.*\/retry|retryRejected|retryItem/);
});

test("admin console shell uses left nav modules and renames the page", async () => {
  const source = await pageSource();
  assert.match(source, /<h1>管理后台<\/h1>/);
  assert.match(source, /Admin Console/);
  assert.match(source, /data-module="users"/);
  assert.match(source, /data-module="feedback"/);
  assert.match(source, /data-module="system"/);
  assert.match(source, /id="moduleUsers"/);
  assert.match(source, /id="moduleFeedback"/);
  assert.match(source, /id="moduleSystem"/);
});

test("connection settings sit below the workflow guide inside system config", async () => {
  const source = await pageSource();
  const guide = source.indexOf('id="workflowGuide"');
  const tools = source.indexOf('id="utilityDrawer"');
  const batch = source.indexOf('class="batch-controller"');
  assert.ok(guide >= 0 && tools > guide, "tools after guide");
  assert.ok(batch > tools, "batch composer after connection tools");
});

test("users and feedback modules call admin list endpoints", async () => {
  const source = await pageSource();
  assert.match(source, /id="userSearch"/);
  assert.match(source, /id="userTable"/);
  assert.match(source, /\/users\?/);
  assert.match(source, /id="feedbackStatusFilter"/);
  assert.match(source, /id="feedbackTable"/);
  assert.match(source, /\/feedback/);
  assert.match(source, /method:\s*"PATCH"/);
});
