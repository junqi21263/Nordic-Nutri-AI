// Server-side orchestration for reviewable food-image batches. The worker is
// intentionally pulled from the admin dashboard or a scheduler: no image task
// is created from client-side state and only an administrator can advance it.

const { buildFoodImagePromptPlan } = require("./food-image-prompts.cjs");
const { getFoodDisplayName } = require("./food-display-name.cjs");
const { normalizeVisualProfileKey, resolveVisualProfile } = require("./food-image-visual-profile.cjs");

const BATCH_STATUSES = new Set(["draft", "running", "paused", "completed", "completed_with_errors", "cancelled"]);
const ITEM_STATUSES = new Set(["pending", "generating", "needs_retry", "needs_review", "completed", "failed", "skipped"]);
const CLAIMABLE_ITEM_STATUSES = ["pending", "needs_retry"];

const FIRST_SAMPLE_FOODS = [
  ["58642682-52eb-4fd1-b719-123d4d068b56", "鸡胸肉"], ["1cda8664-d18d-4f83-84f5-e41828ff05fe", "鸡蛋"],
  ["5317e22d-1339-49b6-943c-fd8b4539fa9d", "三文鱼"], ["9c842be2-ff78-46b8-8c79-ebb222aed9cb", "虾"],
  ["4df018da-0a13-46e3-b12a-693abd30042f", "嫩豆腐"], ["a2f84891-fbda-4c33-9658-d9c8fb9a12e6", "燕麦"],
  ["4038fa86-b82e-4c7a-8bb2-da4136106050", "糙米"], ["980dc311-64cf-4d92-b292-58713c084b73", "全麦面包"],
  ["688b46bc-95a2-41c8-82b7-247cf6ac8cd7", "菠菜"], ["09e77d27-5a71-420b-b0c7-d62bd67b35f6", "西兰花"],
  ["06c97218-4bd2-4636-8053-bd13c3910b1d", "番茄"], ["49e223ca-9964-411e-8fd5-6de05f088031", "土豆"],
  ["7ab00c84-1edb-4aff-8f3a-d9181e4a8f66", "牛油果"], ["c273023d-b2f7-404a-a826-7f6bf75f887b", "蓝莓"],
  ["5806faf2-84c5-472a-b335-7454ce1ac16c", "香蕉"], ["9e0c5af1-ea90-424e-874a-2b4ca7e388f6", "苹果"],
  ["1e3eaaac-59ad-4f09-b488-d3af2a96d15f", "杏仁"], ["04d441ca-203c-4d96-b724-fc1c1257c9c9", "核桃"],
  ["548a1a6f-534c-4381-96a6-00a450c4d69e", "橄榄油"], ["92a08ae6-a336-4057-bafd-9ee3216ee2a0", "原味酸奶"],
].map(([id, nameZh]) => ({ id, nameZh }));

class FoodImageBatchError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function clampInt(value, fallback, min, max) {
  return Math.min(Math.max(Number(value) || fallback, min), max);
}

function normalizeFoodIds(value) {
  const ids = Array.from(new Set((Array.isArray(value) ? value : []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_SELECTION_EMPTY");
  if (ids.length > 100) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_TOO_LARGE");
  return ids;
}

function normalizeBatchPayload(input = {}) {
  const name = String(input.name || "未命名图片批次").trim().slice(0, 120);
  if (!name) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_NAME_REQUIRED");
  const selectionMeta = input.selectionMeta && typeof input.selectionMeta === "object" ? input.selectionMeta : {};
  const visualProfileKey = normalizeVisualProfileKey(input.visualProfileKey || selectionMeta.visualProfileKey);
  const selection = { source: String(input.selectionSource || "manual").slice(0, 40) };
  selection.visualProfileKey = visualProfileKey;
  if (selection.source === "category" && selectionMeta.categoryId) {
    selection.categoryId = String(selectionMeta.categoryId).trim();
    selection.requestedCount = clampInt(selectionMeta.requestedCount, 20, 1, 100);
    selection.selectableCount = Math.max(Number(selectionMeta.selectableCount) || 0, 0);
  }
  return {
    name,
    candidateCount: 1,
    concurrency: clampInt(input.concurrency, 2, 1, 5),
    maxAttempts: clampInt(input.maxAttempts, 3, 1, 3),
    visualProfileKey,
    selection,
  };
}

function normalizeCategoryBatchPayload(input = {}) {
  const categoryId = String(input.categoryId || "").trim();
  if (!categoryId) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_CATEGORY_REQUIRED");
  const name = String(input.name || "分类图片批次").trim().slice(0, 120);
  if (!name) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_NAME_REQUIRED");
  return {
    categoryId,
    count: clampInt(input.count, 20, 1, 100),
    name,
    concurrency: clampInt(input.concurrency, 2, 1, 5),
    maxAttempts: clampInt(input.maxAttempts, 3, 1, 3),
    visualProfileKey: normalizeVisualProfileKey(input.visualProfileKey),
  };
}

function isClaimableBatchItemStatus(status) {
  return CLAIMABLE_ITEM_STATUSES.includes(status);
}

/** Infra / config failures that should not permanently burn the attempt budget. */
const RECOVERABLE_BATCH_ERROR_CODES = new Set([
  "FOOD_IMAGE_BATCH_EXECUTOR_MISSING",
  "FOOD_IMAGE_BATCH_ATTEMPTS_EXHAUSTED",
  "FOOD_IMAGE_BATCH_GENERATING_UNLOCKED",
  "FOOD_IMAGE_JOB_ACTIVE",
  "FOOD_IMAGE_JOB_SUPERSEDED",
  "UNAUTHORIZED",
  "HY_IMAGE_UNAVAILABLE",
  "HY_IMAGE_DISABLED",
  "HY_IMAGE_DAILY_LIMIT",
  "BAD_GATEWAY",
]);

function isRecoverableBatchError(code) {
  return RECOVERABLE_BATCH_ERROR_CODES.has(String(code || ""));
}

function resolveBatchCompletionStatus(batch, counts = {}) {
  if (batch?.status !== "running") return batch?.status;
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  // A candidate in review is intentionally non-terminal: its approval or
  // rejection decides whether the batch has finished or needs another try.
  const terminal = (counts.completed || 0) + (counts.failed || 0) + (counts.skipped || 0);
  if (!total || terminal !== total) return batch.status;
  return (counts.failed || 0) ? "completed_with_errors" : "completed";
}

function mapBatchRow(row, counts = {}) {
  if (!row?.id) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    selection: row.selection_json || {},
    candidateCount: Number(row.candidate_count) || 1,
    concurrency: Number(row.concurrency) || 2,
    totalCount: Number(row.total_count) || 0,
    pendingCount: counts.pending ?? Number(row.pending_count) ?? 0,
    generatingCount: counts.generating ?? Number(row.generating_count) ?? 0,
    reviewCount: counts.needs_review ?? Number(row.review_count) ?? 0,
    retryCount: counts.needs_retry ?? Number(row.retry_count) ?? 0,
    failedCount: counts.failed ?? Number(row.failed_count) ?? 0,
    completedCount: counts.completed ?? Number(row.completed_count) ?? 0,
    skippedCount: counts.skipped ?? Number(row.skipped_count) ?? 0,
    estimatedQuota: Number(row.estimated_quota) || 0,
    consumedQuota: Number(row.consumed_quota) || 0,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapBatchItemRow(row, food = null) {
  return {
    id: row.id,
    batchId: row.batch_id,
    foodId: row.food_id,
    status: row.status,
    jobId: row.job_id ?? null,
    attemptCount: Number(row.attempt_count) || 0,
    promptPlan: row.prompt_plan_json ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    lastImageId: row.last_image_id ?? null,
    retryReason: row.retry_reason ?? null,
    visualProfileKey: row.visual_profile_key ?? row.prompt_plan_json?.visualProfileKey ?? "standard",
    visualProfileLabelZh: row.visual_profile_label_zh ?? row.prompt_plan_json?.visualProfileLabelZh ?? "默认食材",
    nextRetryAt: row.next_retry_at ?? null,
    lockedAt: row.locked_at ?? null,
    lockedBy: row.locked_by ?? null,
    food: food ? {
      id: food.id,
      nameZh: getFoodDisplayName(food),
      category: food.category?.nameZh || null,
    } : null,
  };
}

function createFoodImageBatchService({ db, repository, jobs, resolveAdminExecutor } = {}) {
  if (!db || !repository || !jobs) throw new Error("Food image batch service requires db, repository, and jobs");

  async function requireAdmin(userId) {
    if (!userId) throw new FoodImageBatchError("UNAUTHORIZED");
    if (!await repository.isAdmin(userId)) throw new FoodImageBatchError("FORBIDDEN");
  }

  async function resolveExecutionUserId(userId, batch, { trusted = false } = {}) {
    let executionUserId = trusted
      ? String(batch?.created_by || "").trim()
      : String(userId || "").trim();
    if (!executionUserId && typeof resolveAdminExecutor === "function") {
      try {
        executionUserId = String(await resolveAdminExecutor() || "").trim();
      } catch (error) {
        console.error("[food-image-batches] resolveAdminExecutor failed:", error?.message || error);
      }
    }
    if (executionUserId && trusted && !batch.created_by) {
      const patched = await db.from("food_image_batches").update({ created_by: executionUserId }).eq("id", batch.id);
      if (!patched?.error) batch.created_by = executionUserId;
    }
    return executionUserId;
  }

  async function previewCategory(userId, input = {}) {
    await requireAdmin(userId);
    const payload = normalizeCategoryBatchPayload(input);
    const result = await repository.listBatchImageCandidates({
      categoryId: payload.categoryId,
      count: payload.count,
      visualProfileKey: payload.visualProfileKey,
    });
    const foods = (result.items || []).map((food) => ({
      id: food.id,
      nameZh: getFoodDisplayName({
        nameZh: food.nameZh || food.name_zh,
        nameEn: food.nameEn || food.name_en,
        description: food.description,
        normalizedName: food.normalizedName || food.normalized_name,
      }),
    })).filter((food) => food.id);
    return {
      categoryId: payload.categoryId,
      requestedCount: payload.count,
      selectableCount: Number(result.total ?? foods.length),
      selectedCount: foods.length,
      excludedReadyCount: Number(result.excludedReadyCount) || 0,
      visualProfileKey: payload.visualProfileKey,
      foods,
    };
  }

  async function findBatch(batchId) {
    const result = await db.from("food_image_batches").select("*").eq("id", batchId).maybeSingle();
    if (result.error || !result.data) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_NOT_FOUND");
    return result.data;
  }

  async function countItems(batchId) {
    const result = await db.from("food_image_batch_items").select("status").eq("batch_id", batchId);
    if (result.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_ITEM_LIST_FAILED");
    return (result.data || []).reduce((counts, row) => {
      counts[row.status] = (counts[row.status] || 0) + 1;
      return counts;
    }, {});
  }

  async function refreshSummary(batchId) {
    const [batch, counts] = await Promise.all([findBatch(batchId), countItems(batchId)]);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const nextStatus = resolveBatchCompletionStatus(batch, counts);
    const patch = {
      total_count: total,
      pending_count: counts.pending || 0,
      generating_count: counts.generating || 0,
      review_count: counts.needs_review || 0,
      retry_count: counts.needs_retry || 0,
      failed_count: counts.failed || 0,
      completed_count: counts.completed || 0,
      skipped_count: counts.skipped || 0,
      status: nextStatus,
      finished_at: ["completed", "completed_with_errors"].includes(nextStatus) ? new Date().toISOString() : batch.finished_at,
    };
    await db.from("food_image_batches").update(patch).eq("id", batchId);
    return mapBatchRow({ ...batch, ...patch }, counts);
  }

  async function create(userId, input = {}) {
    await requireAdmin(userId);
    const payload = normalizeBatchPayload(input);
    const foodIds = normalizeFoodIds(input.foodIds);
    const inserted = await db.from("food_image_batches").insert({
      name: payload.name,
      status: "draft",
      selection_json: payload.selection,
      candidate_count: 1,
      concurrency: payload.concurrency,
      max_attempts: payload.maxAttempts,
      estimated_quota: foodIds.length * payload.maxAttempts,
      created_by: userId,
    }).select("*").maybeSingle();
    if (inserted.error || !inserted.data) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_CREATE_FAILED");

    for (const foodId of foodIds) {
      const food = await repository.getFoodById(foodId);
      const profile = food ? resolveVisualProfile(food, payload.visualProfileKey) : null;
      const isReady = Boolean(food?.image && food.image.isFallback === false && (food.image.listUrl || food.image.detailUrl) && profile?.key === (food.visualProfileKey || "standard"));
      const item = {
        batch_id: inserted.data.id,
        food_id: foodId,
        visual_profile_key: profile?.key || "standard",
        visual_profile_label_zh: profile?.labelZh || "默认食材",
        status: food && !isReady ? "pending" : "skipped",
        prompt_plan_json: food ? buildFoodImagePromptPlan({
          foodNameZh: food.nameZh,
          foodNameEn: food.nameEn,
          category: food.category?.nameZh || food.category?.code,
          categoryCode: food.category?.code,
          cookingMethod: food.defaultCookingMethod,
          imageSubjectZh: food.imageSubjectZh,
          visualProfileKey: profile?.key,
          servingDescription: food.servingSize ? `${food.servingSize}${food.servingUnit || "g"}` : undefined,
        }) : null,
        error_code: food ? null : "FOOD_NOT_FOUND",
        error_message: food ? null : "food no longer exists or is unpublished",
      };
      const itemResult = await db.from("food_image_batch_items").insert(item);
      if (itemResult.error) {
        await db.from("food_image_batch_items").insert({
          ...item,
          status: "skipped",
          error_code: "FOOD_IMAGE_BATCH_ACTIVE_CONFLICT",
          error_message: "food already belongs to an active image batch",
        });
      }
    }
    return refreshSummary(inserted.data.id);
  }

  async function createFromCategory(userId, input = {}) {
    const payload = normalizeCategoryBatchPayload(input);
    const preview = await previewCategory(userId, payload);
    if (!preview.foods.length) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_SELECTION_EMPTY");
    return create(userId, {
      name: payload.name,
      foodIds: preview.foods.map((food) => food.id),
      concurrency: payload.concurrency,
      maxAttempts: payload.maxAttempts,
      visualProfileKey: payload.visualProfileKey,
      selectionSource: "category",
      selectionMeta: {
        categoryId: payload.categoryId,
        requestedCount: payload.count,
        selectableCount: preview.selectableCount,
        excludedReadyCount: preview.excludedReadyCount,
        visualProfileKey: payload.visualProfileKey,
      },
    });
  }

  async function createFirstSample(userId) {
    return create(userId, {
      name: "首轮样本-基础食材-20",
      foodIds: FIRST_SAMPLE_FOODS.map((food) => food.id),
      concurrency: 2,
      maxAttempts: 3,
      selectionSource: "curated-first-sample",
    });
  }

  async function list(userId, { page = 1, pageSize = 20 } = {}) {
    await requireAdmin(userId);
    const size = clampInt(pageSize, 20, 1, 100);
    const current = clampInt(page, 1, 1, 9999);
    const result = await db.from("food_image_batches").select("*").order("created_at", { ascending: false })
      .range((current - 1) * size, current * size - 1);
    if (result.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_LIST_FAILED");
    const items = [];
    for (const row of result.data || []) items.push(await refreshSummary(row.id));
    return { items, page: current, pageSize: size };
  }

  async function get(userId, batchId, { page = 1, pageSize = 50 } = {}) {
    await requireAdmin(userId);
    const summary = await refreshSummary(batchId);
    const size = clampInt(pageSize, 50, 1, 100);
    const current = clampInt(page, 1, 1, 9999);
    const result = await db.from("food_image_batch_items").select("*").eq("batch_id", batchId)
      .order("created_at", { ascending: true }).range((current - 1) * size, current * size - 1);
    if (result.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_ITEM_LIST_FAILED");
    const items = [];
    for (const row of result.data || []) items.push(mapBatchItemRow(row, await repository.getFoodById(row.food_id)));
    return { batch: summary, items, page: current, pageSize: size };
  }

  async function changeState(userId, batchId, from, to) {
    await requireAdmin(userId);
    const batch = await findBatch(batchId);
    if (!from.includes(batch.status)) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_STATE_INVALID");
    const patch = { status: to };
    if (to === "running" && !batch.started_at) patch.started_at = new Date().toISOString();
    if (to === "cancelled") {
      patch.finished_at = new Date().toISOString();
      await db.from("food_image_batch_items").update({ status: "skipped", error_code: "BATCH_CANCELLED" })
        .eq("batch_id", batchId).in("status", ["pending", "needs_retry"]);
    }
    await db.from("food_image_batches").update(patch).eq("id", batchId);
    return refreshSummary(batchId);
  }

  async function processNext(userId, batchId, { trusted = false, itemId = "" } = {}) {
    if (!trusted) await requireAdmin(userId);
    const batch = await findBatch(batchId);
    // Scheduled work has no interactive session.  It must execute as the
    // administrator who created the batch, rather than passing a null user
    // into the job service (which correctly rejects it as UNAUTHORIZED).
    // Older batches may have lost created_by via ON DELETE SET NULL — fall back
    // to the console admin actor so patrol / timer dispatch can resume.
    const executionUserId = await resolveExecutionUserId(userId, batch, { trusted });
    if (batch.status !== "running") throw new FoodImageBatchError("FOOD_IMAGE_BATCH_STATE_INVALID");
    const candidateQuery = db.from("food_image_batch_items").select("*").eq("batch_id", batchId).in("status", CLAIMABLE_ITEM_STATUSES)
      .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`);
    if (itemId) candidateQuery.eq("id", itemId);
    const candidate = await candidateQuery.order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (candidate.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_ITEM_LIST_FAILED");
    if (!candidate.data) return { processed: 0, batch: await refreshSummary(batchId) };
    if (Number(candidate.data.attempt_count || 0) >= Number(batch.max_attempts || 3)) {
      await db.from("food_image_batch_items").update({
        status: "failed",
        error_code: "FOOD_IMAGE_BATCH_ATTEMPTS_EXHAUSTED",
        error_message: candidate.data.retry_reason || "maximum review retry attempts reached",
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", candidate.data.id).eq("status", candidate.data.status);
      return { processed: 0, exhausted: true, batch: await refreshSummary(batchId) };
    }
    const locked = await db.from("food_image_batch_items").update({
      status: "generating", locked_at: new Date().toISOString(), locked_by: trusted ? "cloud-scheduled-worker" : "admin-pull-worker",
    }).eq("id", candidate.data.id).eq("status", candidate.data.status).select("*").maybeSingle();
    if (!locked.data) return { processed: 0, batch: await refreshSummary(batchId) };
    try {
      if (!executionUserId) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_EXECUTOR_MISSING", "batch has no administrator executor");
      const food = await repository.getFoodById(locked.data.food_id);
      if (!food) throw new FoodImageBatchError("FOOD_NOT_FOUND");
      const plan = buildFoodImagePromptPlan({
        foodNameZh: getFoodDisplayName(food),
        foodNameEn: food.nameEn,
        category: food.category?.nameZh || food.category?.code,
        categoryCode: food.category?.code,
        cookingMethod: food.defaultCookingMethod,
        imageSubjectZh: food.imageSubjectZh,
        retryReason: locked.data.retry_reason,
        visualProfileKey: locked.data.visual_profile_key,
      });
      const job = await jobs.createJob(executionUserId, {
        foodId: food.id, candidateCount: 1, extraPrompt: plan.extraPrompt,
        cookingMethod: food.defaultCookingMethod, visualProfileKey: locked.data.visual_profile_key,
        deferWorker: true, supersedeActive: true,
      });
      const processed = await jobs.processQueue(null, { jobId: job.id });
      const result = processed.results?.[0];
      const attempts = Number(locked.data.attempt_count || 0) + 1;
      const status = result?.generated > 0 ? "needs_review" : (attempts >= Number(batch.max_attempts || 3) ? "failed" : "needs_retry");
      await db.from("food_image_batch_items").update({
        status, job_id: job.id, visual_profile_id: job.visualProfileId || null, attempt_count: attempts,
        prompt_plan_json: plan,
        error_code: result?.errorCode || null, error_message: result?.errorMessage || null,
        last_image_id: null,
        retry_reason: null,
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", locked.data.id);
      return { processed: 1, itemId: locked.data.id, jobId: job.id, batch: await refreshSummary(batchId) };
    } catch (error) {
      const recoverable = isRecoverableBatchError(error?.code);
      const attempts = recoverable
        ? Number(locked.data.attempt_count || 0)
        : Number(locked.data.attempt_count || 0) + 1;
      await db.from("food_image_batch_items").update({
        status: (!recoverable && attempts >= Number(batch.max_attempts || 3)) ? "failed" : "needs_retry",
        attempt_count: attempts,
        error_code: error?.code || "FOOD_IMAGE_BATCH_PROCESS_FAILED",
        error_message: String(error?.message || error).slice(0, 800),
        next_retry_at: recoverable ? new Date(Date.now() + 60_000).toISOString() : null,
        locked_at: null,
        locked_by: null,
      }).eq("id", locked.data.id);
      return { processed: 1, failed: true, batch: await refreshSummary(batchId) };
    }
  }

  async function recoverStaleGeneratingLocks(batchId, { olderThanMs = 10 * 60 * 1000 } = {}) {
    const cutoff = new Date(Date.now() - olderThanMs).toISOString();
    const released = await db.from("food_image_batch_items").update({
      status: "needs_retry",
      error_code: "FOOD_IMAGE_BATCH_GENERATING_UNLOCKED",
      error_message: "stale generating lock recovered by scheduler",
      next_retry_at: null,
      locked_at: null,
      locked_by: null,
    }).eq("batch_id", batchId).eq("status", "generating").lt("locked_at", cutoff);
    if (released?.error) {
      console.error("[food-image-batches] stale lock recovery failed:", released.error.message || released.error);
    }
  }

  async function dispatchTrusted({ maxItems = 5 } = {}) {
    const limit = clampInt(maxItems, 5, 1, 5);
    const result = await db.from("food_image_batches").select("*").eq("status", "running")
      .order("started_at", { ascending: true }).order("created_at", { ascending: true }).limit(20);
    if (result.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_DISPATCH_LIST_FAILED");
    const attempted = [];
    const outcomes = [];
    for (const batch of result.data || []) {
      if (attempted.length >= limit) break;
      await recoverStaleGeneratingLocks(batch.id);
      const counts = await countItems(batch.id);
      const available = Math.max(0, Math.min(Number(batch.concurrency) || 2, 5) - Number(counts.generating || 0));
      for (let index = 0; index < available && attempted.length < limit; index += 1) {
        attempted.push(batch.id);
        outcomes.push(await processNext(null, batch.id, { trusted: true }));
      }
    }
    return {
      dispatched: outcomes.filter((outcome) => outcome.processed).length,
      attempted: attempted.length,
      outcomes,
    };
  }

  async function reopenBatchItemForRetry(item) {
    const batch = await findBatch(item.batch_id);
    // Operator retries must resume terminal / paused batches; cancelled batches
    // previously blocked with RETRY_BATCH_NOT_RUNNING and left items stuck.
    if (["completed", "completed_with_errors", "cancelled", "paused"].includes(batch.status)) {
      const resumed = await db.from("food_image_batches").update({
        status: "running",
        finished_at: null,
        started_at: batch.started_at || new Date().toISOString(),
      }).eq("id", batch.id);
      if (resumed.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_RETRY_RESUME_FAILED");
      batch.status = "running";
    } else if (batch.status !== "running") {
      return { processed: 0, retryScheduled: false, reason: "RETRY_BATCH_NOT_RUNNING", batch };
    }
    if (item.status === "failed") {
      const resetAttempts = isRecoverableBatchError(item.error_code) || !item.job_id;
      const reopened = await db.from("food_image_batch_items").update({
        status: "needs_retry",
        attempt_count: resetAttempts ? 0 : Math.max(0, Number(item.attempt_count || 0) - 1),
        error_code: null,
        error_message: null,
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", item.id).eq("status", "failed");
      if (reopened.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_RETRY_REOPEN_FAILED");
    } else if (item.status === "generating") {
      // Worker crash / 410 / timeout can leave the lock forever; claimable
      // statuses exclude generating, so operators must unlock before retry.
      const reopened = await db.from("food_image_batch_items").update({
        status: "needs_retry",
        error_code: "FOOD_IMAGE_BATCH_GENERATING_UNLOCKED",
        error_message: "stuck generating lock cancelled for retry",
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", item.id).eq("status", "generating");
      if (reopened.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_RETRY_REOPEN_FAILED");
      item.status = "needs_retry";
      item.locked_at = null;
      item.locked_by = null;
    } else if (item.status === "needs_review") {
      // Missing preview / bad candidate: send back to the claimable queue.
      const reopened = await db.from("food_image_batch_items").update({
        status: "needs_retry",
        error_code: null,
        error_message: null,
        retry_reason: item.retry_reason || "operator requested regeneration",
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      }).eq("id", item.id).eq("status", "needs_review");
      if (reopened.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_RETRY_REOPEN_FAILED");
      item.status = "needs_retry";
    }
    if (typeof jobs.cancelActiveJobs === "function" && item.food_id) {
      try {
        await jobs.cancelActiveJobs(item.food_id, item.visual_profile_id || null);
      } catch (error) {
        console.warn("[food-image-batches] cancelActiveJobs before retry failed:", error?.message || error);
      }
    }
    return null;
  }

  async function retryRejectedJob(userId, jobId) {
    await requireAdmin(userId);
    const result = await db.from("food_image_batch_items").select("*").eq("job_id", jobId)
      .in("status", ["needs_retry", "failed", "generating", "needs_review"]).maybeSingle();
    if (result.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_RETRY_ITEM_LOOKUP_FAILED");
    if (!result.data) return { processed: 0, retryScheduled: false, reason: "RETRY_ITEM_NOT_READY" };
    const blocked = await reopenBatchItemForRetry(result.data);
    if (blocked) return blocked;
    const retried = await processNext(userId, result.data.batch_id, { itemId: result.data.id });
    return { ...retried, retryScheduled: Boolean(retried.processed), retryItemId: result.data.id };
  }

  async function retryFailedItem(userId, itemId) {
    await requireAdmin(userId);
    const id = String(itemId || "").trim();
    if (!id) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_ITEM_REQUIRED");
    const result = await db.from("food_image_batch_items").select("*").eq("id", id)
      .in("status", ["needs_retry", "failed", "generating", "needs_review"]).maybeSingle();
    if (result.error) throw new FoodImageBatchError("FOOD_IMAGE_BATCH_RETRY_ITEM_LOOKUP_FAILED");
    if (!result.data) return { processed: 0, retryScheduled: false, reason: "RETRY_ITEM_NOT_READY" };
    const blocked = await reopenBatchItemForRetry(result.data);
    if (blocked) return blocked;
    const retried = await processNext(userId, result.data.batch_id, { itemId: result.data.id });
    return { ...retried, retryScheduled: Boolean(retried.processed), retryItemId: result.data.id };
  }

  return {
    create, createFromCategory, createFirstSample, previewCategory, list, get, processNext,
    processNextTrusted: (batchId) => processNext(null, batchId, { trusted: true }),
    dispatchTrusted, retryRejectedJob, retryFailedItem,
    start: (userId, id) => changeState(userId, id, ["draft", "paused"], "running"),
    pause: (userId, id) => changeState(userId, id, ["running"], "paused"),
    resume: (userId, id) => changeState(userId, id, ["paused"], "running"),
    cancel: (userId, id) => changeState(userId, id, ["draft", "running", "paused"], "cancelled"),
  };
}

module.exports = {
  BATCH_STATUSES, ITEM_STATUSES, FIRST_SAMPLE_FOODS, FoodImageBatchError,
  normalizeFoodIds, normalizeBatchPayload, normalizeCategoryBatchPayload, isClaimableBatchItemStatus,
  isRecoverableBatchError, resolveBatchCompletionStatus,
  mapBatchRow, mapBatchItemRow, createFoodImageBatchService,
};
