import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = new URL("./food-images.html", import.meta.url);

async function pageSource() {
  return readFile(pagePath, "utf8");
}

test("all admin select controls share the Nordic Nutri select treatment", async () => {
  const source = await pageSource();
  assert.match(source, /(^|[,{\s])select,?\s*\.nn-select\s*\{/);
  assert.match(source, /select:focus,?\s*\.nn-select:focus\s*\{/);
  assert.match(source, /appearance:\s*none/);
});

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

test("review queue selection does not rebuild the whole grid", async () => {
  const source = await pageSource();
  assert.match(source, /Selection should not rebuild the whole grid/);
  assert.match(source, /loading="lazy"/);
  assert.match(source, /MODULE_CACHE_TTL_MS/);
  assert.match(source, /Promise\.all\(\[\s*refreshBatches/);
});

test("category-based batch creation replaces manual food and job identifiers", async () => {
  const source = await pageSource();
  assert.match(source, /id="batchCategory"/);
  assert.match(source, /id="batchCountInput"/);
  assert.match(source, /id="createCategoryBatch"/);
  assert.match(source, /创建并启动|创建草稿/);
  assert.match(source, /手工建批/);
  assert.match(source, /function syncActiveBatchSummary\(/);
  assert.match(source, /userImageReviewLabel/);
  assert.match(source, /待审/);
  assert.match(source, /refreshBatches\(\)\.catch/);
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

test("prompt inspector exposes visual type diagnostics and a manual override", async () => {
  const source = await pageSource();
  assert.match(source, /FOOD_VISUAL_TYPE_OPTIONS/);
  assert.match(source, /识别视觉类型/);
  assert.match(source, /命中的关键词/);
  assert.match(source, /最终正向提示词/);
  assert.match(source, /最终负向提示词/);
  assert.match(source, /饮品子类型/);
  assert.match(source, /忽略的低优先级关键词/);
  assert.match(source, /被排除的候选类型/);
  assert.match(source, /最终规则优先级/);
  assert.match(source, /id="visualTypeOverride"/);
  assert.match(source, /saveVisualTypeOverride/);
  assert.match(source, /visualType/);
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

test("admin connection defaults to the primary CloudBase HTTP function without exposing API Base on login", async () => {
  const source = await pageSource();
  assert.match(source, /const PRODUCTION_API_BASE = "https:\/\/lewis-healthy-d4glgqqzv73a5bc10\.service\.tcloudbase\.com\/get-login-ticket"/);
  assert.match(source, /const TEST_API_BASE = "https:\/\/test-dev-d4gyxnn0b5dfa2c8a\.service\.tcloudbase\.com\/get-login-ticket"/);
  assert.match(source, /window\.location\.hostname\.startsWith\("test-dev-d4gyxnn0b5dfa2c8a"\)/);
  assert.match(source, /function apiBase\(\)/);
  assert.doesNotMatch(source, /高级：API Base/);
  assert.doesNotMatch(source, /id="baseUrl"/);
  assert.doesNotMatch(source, /id="systemBaseUrlNote"/);
});

test("review queue supports selectable batch approval and an operator workflow guide", async () => {
  const source = await pageSource();
  assert.match(source, /id="workflowGuide"/);
  assert.match(source, /id="selectAllReview"/);
  assert.match(source, /id="approveSelected"/);
  assert.match(source, /state\.selectedImageIds/);
  assert.match(source, /async function approveSelectedImages\(/);
});

test("review queue can batch regenerate selected candidates through the existing retry route", async () => {
  const source = await pageSource();
  assert.match(source, /id="regenerateSelected"/);
  assert.match(source, /async function regenerateSelectedImages\(/);
  assert.match(source, /data-batch-item-id=/);
  assert.match(source, /food-image-batch-items\/\$\{itemId\}\/retry/);
  assert.match(source, /当前最新的食物视觉形态提示词/);
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

test("switching from failed to all renders immediately without hydrating every historical job", async () => {
  const source = await pageSource();
  assert.match(source, /data-filter="all" type="button"/);
  assert.match(source, /const hydrateTargets = items\.filter\(\(item\) => item\.jobId && item\.status === "needs_review"\)/);
  assert.match(source, /button\.onclick = async \(event\) => \{ event\.preventDefault\(\); state\.activeFilter = button\.dataset\.filter;/);
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
  assert.match(source, /重新生图/);
  assert.match(source, /FOOD_IMAGE_JOB_ACTIVE/);
  assert.match(source, /retryItemTop/);
  assert.match(source, /data-retry-item-id/);
  assert.match(source, /food-image-batch-items\/\$\{[^}]+\}\/retry|retryItemNow|retryFailedItem/);
  assert.match(source, /needs_retry.*failed.*generating|generating.*needs_retry|取消并重试/);
});

test("stuck generating items expose cancel-and-retry action", async () => {
  const source = await pageSource();
  assert.match(source, /取消并重试/);
  assert.match(source, /status === "generating"/);
  assert.match(source, /卡在生成|取消卡住|生成中.*重试|stuck|unlock/i);
});

test("admin console shell uses left nav modules and renames the page", async () => {
  const source = await pageSource();
  assert.match(source, /<h1>管理后台<\/h1>/);
  assert.match(source, /Admin Console/);
  assert.match(source, /data-module="users"/);
  assert.match(source, /data-module="feedback"/);
  assert.match(source, /data-module="foods"/);
  assert.match(source, /data-module="images"/);
  assert.match(source, /data-module="ops"/);
  assert.match(source, /data-module="quota"/);
  assert.match(source, /data-module="user-images"/);
  assert.match(source, /data-module="moderation"/);
  assert.match(source, /data-module="system"/);
  assert.match(source, /id="moduleUsers"/);
  assert.match(source, /id="moduleFeedback"/);
  assert.match(source, /id="moduleFoods"/);
  assert.match(source, /id="moduleImages"/);
  assert.match(source, /id="moduleOps"/);
  assert.match(source, /id="moduleQuota"/);
  assert.match(source, /id="moduleUserImages"/);
  assert.match(source, /id="moduleModeration"/);
  assert.match(source, /id="moduleSystem"/);
  assert.match(source, /食材管理/);
  assert.match(source, /食材生图/);
  assert.match(source, /运营总览/);
  assert.match(source, /额度管理/);
  assert.match(source, /用户图片/);
  assert.match(source, /内容安全/);
});

test("old image audit is a standalone admin module with explicit latest-prompt regeneration copy", async () => {
  const source = await pageSource();
  assert.match(source, /data-module="audit"[^>]*>旧图审计/);
  assert.match(source, /id="moduleAudit" class="admin-module" hidden/);
  assert.match(source, /\$\("moduleAudit"\)\.hidden = name !== "audit"/);
  assert.match(source, /重新生图会使用当前最新的食物视觉形态提示词/);
});

test("old image audit presents old images as review cards and follows regenerated job status", async () => {
  const source = await pageSource();
  assert.match(source, /id="auditReviewWorkspace"/);
  assert.match(source, /id="auditReviewGrid"/);
  assert.match(source, /async function renderAuditWorkspace\(/);
  assert.match(source, /loadJobCandidates\(item\.regenerationJobId\)/);
  assert.match(source, /旧主图/);
  assert.match(source, /新候选图/);
  assert.match(source, /待 AI 复核/);
  assert.match(source, /待审核/);
});

test("user images module wires list delete and purge APIs", async () => {
  const source = await pageSource();
  assert.match(source, /id="userImageKindFilter"/);
  assert.match(source, /id="userImageUserId"/);
  assert.match(source, /id="userImagesGrid"/);
  assert.match(source, /function loadUserImagesModule\(/);
  assert.match(source, /\/ops\/user-images\?/);
  assert.match(source, /\/ops\/user-images\/\$\{kind\}\/\$\{id\}/);
  assert.match(source, /\/ops\/vision-images\/purge/);
  assert.match(source, /name === "user-images"/);
  assert.match(source, /id="userImageLightbox"/);
  assert.match(source, /data-user-image-preview/);
  assert.match(source, /openUserImageLightbox/);
  assert.match(source, /userImageSelectAll/);
  assert.match(source, /data-user-image-select/);
  assert.match(source, /deleteSelectedUserImages/);
  assert.match(
    source,
    /<th><input id="userImageSelectAll"[^>]*><\/th>\s*<th>用户 UUID<\/th>\s*<th>记录 ID<\/th>\s*<th>识别名 \/ 标题<\/th>\s*<th>类型<\/th>\s*<th>缩略图<\/th>\s*<th>上传时间<\/th>\s*<th>审核状态<\/th>\s*<th>关联餐食<\/th>\s*<th>操作<\/th>/,
  );
  assert.match(source, /关联餐食/);
  assert.doesNotMatch(source, /id="moderationViewTab"/);
  assert.doesNotMatch(source, /id="moderationVisionGrid"/);
});

test("ops overview module loads metrics and deletion log", async () => {
  const source = await pageSource();
  assert.match(source, /id="moduleOps"/);
  assert.match(source, /id="opsOverviewStats"/);
  assert.match(source, /id="opsDeletionTable"/);
  assert.doesNotMatch(source, /id="opsModerationTable"/);
  assert.match(source, /id="refreshOps"/);
  assert.match(source, /id="runOpsPatrol"/);
  assert.match(source, /function loadOpsOverview\(/);
  assert.match(source, /\/ops\/overview\?hours=24/);
  assert.match(source, /\/ops\/deletion-log\?limit=50/);
  assert.match(source, /name === "ops"/);
  assert.match(source, /loadOpsOverview\(\)/);
  assert.match(source, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
});

test("quota and moderation admin modules wire dedicated APIs", async () => {
  const source = await pageSource();
  assert.match(source, /id="moduleQuota"/);
  assert.match(source, /id="quotaModelBoard"/);
  assert.match(source, /id="quotaModelTable"/);
  assert.match(source, /id="quotaFeatureStats"/);
  assert.match(source, /id="quotaDaysFilter"/);
  assert.match(source, /function loadQuotaManagement\(/);
  assert.match(source, /function renderModelBoard\(/);
  assert.match(source, /tokens\?\.applicable === false/);
  assert.match(source, /不适用/);
  assert.match(source, /function renderAreaChart\(/);
  assert.match(source, /modelBoard/);
  assert.match(source, /\/ops\/quota\?days=/);
  assert.match(source, /id="moduleModeration"/);
  assert.match(source, /id="moderationSummaryStats"/);
  assert.match(source, /id="moderationCoverage"/);
  assert.match(source, /id="moderationChart"/);
  assert.match(source, /id="moderationSourceTable"/);
  assert.match(source, /id="moderationTermTable"/);
  assert.match(source, /id="moderationTable"/);
  assert.match(source, /id="moderationStatusFilter"/);
  assert.match(source, /function loadModerationModule\(/);
  assert.match(source, /\/ops\/moderation-dashboard/);
  assert.match(source, /\/ops\/moderation-flags\/\$\{id\}/);
  assert.match(source, /name === "quota"/);
  assert.match(source, /name === "moderation"/);
  assert.match(source, /2026-08-05-ops-v7/);
  assert.match(source, /quota-model-section__head/);
  assert.match(source, /data-model-toggle/);
  assert.match(source, /_openQuotaModel/);
  assert.match(source, /background:\s*#f7f8f4/);
  assert.match(source, /dark:\s*false/);
  assert.match(source, /QUOTA_AUTO_REFRESH_MS/);
  assert.match(source, /15 \* 60 \* 1000/);
  assert.match(source, /syncQuotaAutoRefresh/);
  assert.doesNotMatch(source, /background:\s*#1b1f24/);
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

test("connection settings sit in system config while patrol and old-image audit have separate workspaces", async () => {
  const source = await pageSource();
  const audit = source.indexOf('id="moduleAudit"');
  const images = source.indexOf('id="moduleImages"');
  const system = source.indexOf('id="moduleSystem"');
  const guide = source.indexOf('id="workflowGuide"');
  const tools = source.indexOf('id="utilityDrawer"');
  const auditCard = source.indexOf('aria-label="历史主图审计"');
  const patrolCard = source.indexOf('aria-label="自动巡检生图"');
  assert.ok(images >= 0 && system > images, "system module after images module");
  assert.ok(audit >= 0 && audit < images, "audit workspace before images module");
  assert.ok(auditCard > audit && auditCard < images, "audit card inside audit workspace");
  assert.ok(guide > images && guide < system, "workflow guide inside images");
  assert.ok(patrolCard > images && patrolCard < system, "patrol controls inside images");
  assert.ok(tools > system, "connection tools inside system");
  assert.match(source, /会话与诊断/);
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

test("trace detail exposes the sanitized diagnostic package action", async () => {
  const source = await pageSource();
  assert.match(source, /data-trace-diagnostic/);
  assert.match(source, /\/diagnostics\//);
  assert.match(source, /Diagnostic Package|诊断包/);
});

test("trace explorer distinguishes async processing from failure", async () => {
  const source = await pageSource();
  assert.match(source, /value="processing">processing/);
  assert.match(source, /processing: "后台处理中"/);
});

test("trace explorer exposes stage and quick filters", async () => {
  const source = await pageSource();
  assert.match(source, /id="traceStageFilter"/);
  assert.match(source, /data-trace-quick-filter="failed"/);
  assert.match(source, /data-trace-quick-filter="last24h"/);
  assert.match(source, /traceActiveFilters/);
  assert.match(source, /params\.set\("stage"/);
});

test("trace explorer exposes route and HTTP status search and filters", async () => {
  const source = await pageSource();
  assert.match(source, /Trace ID \/ 接口 \/ 错误码/);
  assert.match(source, /id="traceHttpStatusFilter"/);
  assert.match(source, /value="503">503/);
  assert.match(source, /<th>接口<\/th>/);
  assert.match(source, /<th>状态码<\/th>/);
  assert.match(source, /params\.set\("route"/);
  assert.match(source, /params\.set\("httpStatus"/);
});

test("trace explorer keeps status, time, and trace id readable in fixed columns", async () => {
  const source = await pageSource();
  assert.match(source, /class="data-table data-table--traces"/);
  assert.match(source, /\.data-table--traces table \{ min-width: 1120px; table-layout: fixed; \}/);
  assert.match(source, /\.trace-cell--status,\s*\.trace-cell--http,\s*\.trace-cell--duration,\s*\.trace-cell--time \{ white-space: nowrap; \}/);
  assert.match(source, /\.trace-cell--id \.ops-inline-link \{ display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; \}/);
});

test("trace explorer exposes pagination for older and non-success traces", async () => {
  const source = await pageSource();
  assert.match(source, /id="tracePagination"/);
  assert.match(source, /tracePagePrev/);
  assert.match(source, /tracePageNext/);
  assert.match(source, /new URLSearchParams\(\{ page: String\(state\.tracePage\), limit: String\(state\.tracePageSize\) \}/);
  assert.match(source, /data\.total/);
});

test("shows a login gate before revealing the admin console", async () => {
  const source = await pageSource();
  assert.match(source, /id="loginGate"/);
  assert.match(source, /id="adminApp"/);
  assert.match(source, /class="[^"]*\badmin-shell\b[^"]*"[^>]*\bhidden\b/);
  assert.match(source, /登录管理后台/);
  assert.match(source, /function showLoginGate\(/);
  assert.match(source, /function showAdminApp\(/);
  assert.match(source, /showLoginGate\(\)/);
  assert.match(source, /id="logoutBtn"/);
  assert.match(source, /loginForm"\.onsubmit|id="loginForm"/);
});

test("marks the admin console as the DEV test environment on login and after entry", async () => {
  const source = await pageSource();
  assert.match(source, /DEV 测试环境/);
  assert.match(source, /id="loginEnvironmentBadge"/);
  assert.match(source, /id="adminEnvironmentBadge"/);
});

test("persists admin credentials in localStorage and auto-connects on reload", async () => {
  const source = await pageSource();
  assert.match(source, /nordic-admin-session-token/);
  assert.match(source, /nordic-admin-username/);
  assert.match(source, /id="adminUsername"/);
  assert.match(source, /id="adminPassword"/);
  assert.match(source, /\/api\/admin\/login/);
  assert.match(source, /localStorage\.setItem/);
  assert.match(source, /id="clearCredentials"/);
  assert.match(source, /if \(hasToken\(\)\) connect\(\)/);
  assert.match(source, /saveCredentials\(\)/);
  assert.doesNotMatch(source, /管理员 Bearer Token/);
});

test("fresh login and reload open the overview module", async () => {
  const source = await pageSource();
  assert.match(source, /function showAdminApp\([\s\S]*?setModule\("dashboard"\)/);
  assert.match(source, /id="moduleDashboard" class="admin-module" hidden/);
  assert.match(source, /id="moduleImages" class="admin-module nn-food-operations"/);
});

test("food image admin exposes a safe old-image audit workflow", async () => {
  const source = await pageSource();
  assert.match(source, /id="auditPreview"/);
  assert.match(source, /id="auditRunReview"/);
  assert.match(source, /保留旧图/);
  assert.match(source, /加入重生队列/);
  assert.match(source, /food-image-audits\/preview/);
  assert.match(source, /food-image-audit-items\/\$\{itemId\}\/regenerate/);
  assert.match(source, /旧主图会保留，直到新候选审核通过/);
});

test("feedback console uses Chinese statuses and exposes a reply action", async () => {
  const source = await readFile(new URL("./food-images.html", import.meta.url), "utf8");
  assert.match(source, /new: "已收到", reviewing: "处理中", resolved: "已回复", closed: "已关闭"/);
  assert.match(source, /回复反馈/);
  assert.match(source, /保存回复并通知用户/);
  assert.match(source, /body: \{ reply \}/);
});

test("AI management uses the complete quota feature catalog and feature-first routing", async () => {
  const source = await pageSource();
  for (const feature of [
    ["vision", "食物识别"],
    ["coach", "营养教练"],
    ["daily_insight", "每日洞察"],
    ["weekly_review", "周回顾"],
    ["nutrition_plan", "营养计划"],
    ["daily_tip", "每日小贴士"],
    ["proactive_daily_brief", "NOVA 每日提醒"],
    ["food_image", "食材生图"],
  ]) {
    assert.match(source, new RegExp(`key: "${feature[0]}"`));
    assert.match(source, new RegExp(`label: "${feature[1]}"`));
  }
  assert.match(source, /id="aiFeatureRouteBoard"/);
  assert.match(source, /data-ai-feature-route=/);
  assert.match(source, /应用功能配置/);
  assert.doesNotMatch(source, /data-ai-application=/);
});

test("AI provider editor only asks for provider credentials and catalog model", async () => {
  const source = await pageSource();
  assert.match(source, /const MODEL_DEFAULT_TIMEOUT_MS = 30000/);
  assert.match(source, /const MODEL_DEFAULT_MAX_TOKENS = 2048/);
  assert.match(source, /const MODEL_DEFAULT_TEMPERATURE = 0\.2/);
  assert.match(source, /id="aiProviderSelect"/);
  assert.match(source, /id="aiProviderApiKey"[^>]*type="password"/);
  assert.match(source, /id="aiProviderModelSelect"/);
  assert.doesNotMatch(source, /id="aiModelProtocol"/);
  assert.doesNotMatch(source, /id="aiModelBaseUrl"/);
  assert.doesNotMatch(source, /id="aiModelEndpoint"/);
  assert.match(source, /\/ai\/providers/);
  assert.match(source, /\/ai\/catalog/);
});

test("admin toast is centered, dismissible, and accessible", async () => {
  const source = await pageSource();
  assert.match(source, /id="toastMessage"/);
  assert.match(source, /id="toastClose"/);
  assert.match(source, /left: 50%/);
  assert.match(source, /top: 50%/);
  assert.match(source, /toastClose.*hideToast|hideToast.*toastClose/s);
});

test("success toast policy only allows save or activation feedback", async () => {
  const source = await pageSource();
  assert.match(source, /shouldShowSuccessToast/);
  assert.match(source, /保存|生效|切换/);
  assert.match(source, /if \(!isError && !shouldShowSuccessToast\(message\)\) return/);
});

test("AI workspaces and provider status keep routing, quota, history, and secrets separated", async () => {
  const source = await pageSource();
  assert.match(source, /data-ai-workspace="routing"/);
  assert.match(source, /data-ai-workspace="quota"/);
  assert.match(source, /data-ai-workspace="history"/);
  assert.match(source, /模型路由/);
  assert.match(source, /模型额度/);
  assert.match(source, /切换记录/);
  assert.match(source, /Provider 与模型状态/);
  assert.match(source, /Key \$\{status\}/);
  assert.match(source, /已配置/);
  assert.match(source, /未配置/);
  assert.doesNotMatch(source, /Key：[^<\n]+/);
});
