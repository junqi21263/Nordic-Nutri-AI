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

test("reject modal exposes structured reason codes and missing image-subject filter", async () => {
  const source = await pageSource();
  assert.match(source, /id="rejectReasonModal"/);
  assert.match(source, /reject-modal__panel/);
  assert.match(source, /reject-reason-grid/);
  assert.match(source, /REJECT_REASON_OPTIONS/);
  assert.match(source, /wrong_identity/);
  assert.match(source, /reasonCode/);
  assert.match(source, /button danger/);
  assert.match(source, /id="foodAdminMissingSubjectOnly"/);
  assert.match(source, /missingImageSubject/);
});

test("auto patrol panel configures category watches under a 500 daily cap", async () => {
  const source = await pageSource();
  assert.match(source, /分类自动巡检/);
  assert.match(source, /id="patrolCategory"/);
  assert.match(source, /id="addPatrolRule"/);
  assert.match(source, /food-image-patrol\/rules/);
  assert.match(source, /日上限 500/);
  assert.match(source, /class="composer-deck"/);
  assert.match(source, /function patrolSkipSummary\(/);
  assert.match(source, /id="toggleBatchRail"/);
  assert.match(source, /batchRailCollapsed/);
  assert.match(source, /id="patrolInterval"/);
  assert.match(source, /intervalMinutes/);
});

test("batch rail can collapse while keeping the active batch visible", async () => {
  const source = await pageSource();
  assert.match(source, /id="batchListActive"/);
  assert.match(source, /function syncBatchRailCollapsed\(/);
  assert.match(source, /\.batch-rail\.collapsed \.batch-list \{ display: none/);
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
  assert.match(source, /data-module="foods"/);
  assert.match(source, /data-module="images"/);
  assert.match(source, /data-module="system"/);
  assert.match(source, /id="moduleUsers"/);
  assert.match(source, /id="moduleFeedback"/);
  assert.match(source, /id="moduleFoods"/);
  assert.match(source, /id="moduleImages"/);
  assert.match(source, /id="moduleSystem"/);
  assert.match(source, /食材管理/);
  assert.match(source, /食材生图/);
});

test("foods admin module supports CRUD UI and image batch linkage", async () => {
  const source = await pageSource();
  assert.match(source, /data-module="foods"/);
  assert.match(source, /id="moduleFoods"/);
  assert.match(source, /食材管理/);
  assert.match(source, /id="foodAdminSearch"/);
  assert.match(source, /id="foodAdminEditor"/);
  assert.match(source, /\/foods\?/);
  assert.match(source, /method:\s*"POST"/);
  assert.match(source, /\/foods\/\$\{[^}]+\}\/archive|\/archive/);
  assert.match(source, /food-image-batches/);
  assert.match(source, /批量加入生图|生图/);
});

test("foods admin pagination supports page jump and outline buttons", async () => {
  const source = await pageSource();
  assert.match(source, /id="foodAdminPageInput"/);
  assert.match(source, /id="foodAdminGoPage"/);
  assert.match(source, /jumpFoodAdminPage/);
  assert.match(source, /data-food-action="edit"/);
  assert.match(source, /\.button\s*\{[^}]*background:\s*transparent/s);
  assert.match(source, /\.admin-nav__item\.active\s*\{[^}]*background:\s*transparent/s);
});

test("food editor opens as a compact modal dialog", async () => {
  const source = await pageSource();
  assert.match(source, /food-admin-modal/);
  assert.match(source, /food-admin-modal__panel/);
  assert.match(source, /id="foodAdminEditorBackdrop"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /document\.body\.style\.overflow\s*=\s*"hidden"/);
  assert.match(source, /width:\s*min\(520px/);
  assert.match(source, /async function openFoodEditor[\s\S]*?editor\.hidden = false;\s*document\.body\.style\.overflow = "hidden";/);
});

test("admin food categories match food-library root taxonomy only", async () => {
  const source = await pageSource();
  assert.match(source, /FOOD_LIBRARY_ROOT_CODES/);
  assert.match(source, /foodLibraryRootCategories/);
  assert.match(source, /FOOD_LIBRARY_ROOT_CODE_SET\.has\(category\.code\)/);
  assert.match(source, /meat_poultry/);
  assert.match(source, /seafood/);
  assert.match(source, /egg_dairy/);
  assert.match(source, /foodLibraryCategoryLabel/);
  assert.doesNotMatch(source, /seafood\.marine_fish|海水鱼/);
});

test("connection settings sit in system config while image tools live under 食材生图", async () => {
  const source = await pageSource();
  const images = source.indexOf('id="moduleImages"');
  const system = source.indexOf('id="moduleSystem"');
  const guide = source.indexOf('id="workflowGuide"');
  const tools = source.indexOf('id="utilityDrawer"');
  const batch = source.indexOf('class="composer-deck"');
  assert.ok(images >= 0 && system > images, "system module after images module");
  assert.ok(guide > images && guide < system, "workflow guide inside images");
  assert.ok(tools > system, "connection tools inside system");
  assert.ok(batch > images && batch < system, "batch composer inside images");
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

test("persists admin credentials in localStorage and auto-connects on reload", async () => {
  const source = await pageSource();
  assert.match(source, /nordic-admin-bearer-token/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /id="clearCredentials"/);
  assert.match(source, /if \(hasToken\(\)\) connect\(\)/);
  assert.match(source, /saveCredentials\(\)/);
});
