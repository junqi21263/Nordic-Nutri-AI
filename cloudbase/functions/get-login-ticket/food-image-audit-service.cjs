const { buildFoodImagePromptPlan } = require("./food-image-prompts.cjs");
const { FOOD_VISUAL_TYPES, FOOD_VISUAL_TYPE_OPTIONS, resolveFoodVisualType } = require("./food-image-visual-type.cjs");

const HIGH_RISK_PROCESSED_TYPES = new Set([
  "drink_powder", "coffee_powder", "flour_powder", "dry_spice", "beverage_liquid",
  "alcohol_bottle", "non_alcohol_wine", "condiment_liquid", "sauce_paste",
  "dairy_liquid", "dairy_solid", "canned_food", "packaged_snack", "prepared_dish",
]);
const REVIEWED_ITEM_STATUSES = new Set(["ai_pass", "needs_review", "failed"]);

class FoodImageAuditError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

function clampCount(value) {
  return Math.min(100, Math.max(1, Number(value) || 20));
}

function mapItem(row) {
  if (!row) return null;
  return {
    id: row.id,
    runId: row.run_id,
    foodId: row.food_id,
    oldImageId: row.old_image_id,
    imageUrl: row.image_url,
    visualType: row.visual_type,
    visualTypeLabel: FOOD_VISUAL_TYPE_OPTIONS[row.visual_type] || row.visual_type,
    decisionSource: row.decision_source,
    matchedKeywords: row.matched_keywords || [],
    riskReasons: row.risk_reasons || [],
    promptPlan: row.prompt_plan_json,
    aiResult: row.ai_result_json,
    aiConfidence: row.ai_confidence == null ? null : Number(row.ai_confidence),
    status: row.status,
    operatorDecision: row.operator_decision || null,
    regenerationJobId: row.regeneration_job_id || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
  };
}

function mapRun(row) {
  if (!row) return null;
  const rawItems = row.food_image_audit_items || row.items || [];
  return {
    id: row.id,
    scope: row.scope,
    status: row.status,
    requestedCount: row.requested_count,
    candidateCount: row.candidate_count,
    reviewedCount: row.reviewed_count,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    items: rawItems.map(mapItem).filter(Boolean),
  };
}

function candidateFood(input) {
  const food = input?.food || {};
  return {
    id: food.id,
    nameZh: food.nameZh || food.name_zh || "",
    nameEn: food.nameEn || food.name_en || "",
    category: food.category || null,
    categoryCode: food.category?.code || food.categoryCode || "",
    tags: Array.isArray(food.tags) ? food.tags : [],
    visualType: food.visualType || food.visual_type || null,
  };
}

function riskReasons(resolution) {
  const label = FOOD_VISUAL_TYPE_OPTIONS[resolution.visualType] || resolution.visualType;
  const keywords = resolution.matchedKeywords || [];
  return [
    `加工食品视觉类型：${label}`,
    keywords.length ? `完整形态词优先：${keywords.join("、")}` : "加工食品需按最终可食用形态复核",
  ];
}

function getJobId(job) {
  return job?.id || job?.jobId || job?.job_id || null;
}

function createFoodImageAuditService({ db, repository, auditVision, jobs, requireAdmin } = {}) {
  if (!db || !repository || typeof repository.listExistingPrimaryImagesForAudit !== "function" || !auditVision || !jobs || typeof jobs.regenerate !== "function" || typeof requireAdmin !== "function") {
    throw new Error("Food image audit service requires db, repository, auditVision, jobs, and requireAdmin");
  }

  async function findItem(itemId) {
    const result = await db.from("food_image_audit_items").select("*").eq("id", itemId).maybeSingle();
    if (result.error) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEM_READ_FAILED", result.error.message);
    if (!result.data) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEM_NOT_FOUND");
    return result.data;
  }

  async function writeItem(itemId, patch) {
    const result = await db.from("food_image_audit_items").update(patch).eq("id", itemId).select("*").maybeSingle();
    if (result.error || !result.data) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEM_UPDATE_FAILED", result.error?.message);
    return mapItem(result.data);
  }

  async function refreshRunReviewSummary(runId) {
    const itemsResult = await db.from("food_image_audit_items").select("status").eq("run_id", runId);
    if (itemsResult.error) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEMS_READ_FAILED", itemsResult.error.message);
    const items = itemsResult.data || [];
    const reviewedCount = items.filter((item) => REVIEWED_ITEM_STATUSES.has(item.status)).length;
    const pendingCount = items.filter((item) => !REVIEWED_ITEM_STATUSES.has(item.status)).length;
    const status = pendingCount > 0
      ? "reviewing"
      : items.some((item) => item.status === "failed") ? "completed_with_errors" : "completed";
    const updated = await db.from("food_image_audit_runs").update({
      status,
      candidate_count: items.length,
      reviewed_count: reviewedCount,
    }).eq("id", runId).select("*").maybeSingle();
    if (updated.error || !updated.data) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_RUN_UPDATE_FAILED", updated.error?.message);
    return mapRun(updated.data);
  }

  async function previewHighRisk(userId, { count } = {}) {
    await requireAdmin(userId);
    const requestedCount = clampCount(count);
    const candidates = await repository.listExistingPrimaryImagesForAudit({ limit: 100 });
    const selected = [];
    for (const candidate of candidates.items || []) {
      const food = candidateFood(candidate);
      const image = candidate?.image || {};
      if (!food.id || !image.id || !image.detailUrl) continue;
      const resolution = resolveFoodVisualType(food);
      if (!HIGH_RISK_PROCESSED_TYPES.has(resolution.visualType)) continue;
      selected.push({ food, image, resolution });
      if (selected.length >= requestedCount) break;
    }

    const createdRun = await db.from("food_image_audit_runs").insert({
      scope: "high_risk_processed",
      status: "previewed",
      requested_count: requestedCount,
      candidate_count: selected.length,
      reviewed_count: 0,
      created_by: userId,
    }).select("*").maybeSingle();
    if (createdRun.error || !createdRun.data) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_RUN_CREATE_FAILED", createdRun.error?.message);

    const rows = selected.map(({ food, image, resolution }) => ({
      run_id: createdRun.data.id,
      food_id: food.id,
      old_image_id: image.id,
      image_url: image.detailUrl,
      visual_type: resolution.visualType,
      decision_source: resolution.source,
      matched_keywords: resolution.matchedKeywords,
      risk_reasons: riskReasons(resolution),
      prompt_plan_json: buildFoodImagePromptPlan({
        foodId: food.id,
        foodNameZh: food.nameZh,
        foodNameEn: food.nameEn,
        category: food.category?.nameZh || food.category?.name_zh || "",
        categoryCode: food.categoryCode,
        tags: food.tags,
        visualType: food.visualType,
      }),
      status: "pending_review",
    }));
    let insertedItems = [];
    if (rows.length) {
      const inserted = await db.from("food_image_audit_items").insert(rows).select("*");
      if (inserted.error) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEMS_CREATE_FAILED", inserted.error.message);
      insertedItems = inserted.data || [];
    }
    return { run: mapRun(createdRun.data), items: insertedItems.map(mapItem) };
  }

  async function listRun(userId, runId) {
    await requireAdmin(userId);
    const result = await db.from("food_image_audit_runs").select("*, food_image_audit_items(*)").eq("id", runId).maybeSingle();
    if (result.error) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_RUN_READ_FAILED", result.error.message);
    if (!result.data) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_RUN_NOT_FOUND");
    return mapRun(result.data);
  }

  async function reviewItems(userId, runId, { itemIds } = {}) {
    await requireAdmin(userId);
    const ids = [...new Set((Array.isArray(itemIds) ? itemIds : []).map(String).filter(Boolean))].slice(0, 100);
    if (!ids.length) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEMS_REQUIRED");
    const run = await db.from("food_image_audit_runs").select("*").eq("id", runId).maybeSingle();
    if (run.error) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_RUN_READ_FAILED", run.error.message);
    if (!run.data) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_RUN_NOT_FOUND");
    const reviewed = [];
    for (const itemId of ids) {
      const item = await findItem(itemId);
      if (item.run_id !== runId) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_ITEM_RUN_MISMATCH");
      try {
        const result = await auditVision({
          imageUrl: item.image_url,
          foodNameZh: item.prompt_plan_json?.foodNameZh || "",
          foodNameEn: item.prompt_plan_json?.foodNameEn || "",
          expectedVisualType: item.visual_type,
          matchedKeywords: item.matched_keywords,
        });
        const status = result.verdict === "pass" ? "ai_pass" : "needs_review";
        reviewed.push(await writeItem(itemId, {
          status,
          ai_result_json: result,
          ai_confidence: result.confidence,
        }));
      } catch (error) {
        reviewed.push(await writeItem(itemId, {
          status: "failed",
          ai_result_json: { code: error?.code || "FOOD_IMAGE_AUDIT_VISION_RETRYABLE", message: error?.message || "旧图视觉复核失败" },
          ai_confidence: null,
        }));
      }
    }
    const refreshedRun = await refreshRunReviewSummary(runId);
    return { runId, run: refreshedRun, items: reviewed };
  }

  async function keepItem(userId, itemId) {
    await requireAdmin(userId);
    await findItem(itemId);
    return writeItem(itemId, { status: "kept", operator_decision: "keep", regeneration_job_id: null });
  }

  async function requestRegeneration(userId, itemId, { visualType } = {}) {
    await requireAdmin(userId);
    const item = await findItem(itemId);
    const override = visualType == null || visualType === "" ? null : String(visualType).trim();
    if (override && !FOOD_VISUAL_TYPES.includes(override)) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_VISUAL_TYPE_INVALID");
    if (override) {
      if (typeof repository.updateFood !== "function") throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_VISUAL_OVERRIDE_UNSUPPORTED");
      if (typeof repository.getFoodByIdAdmin !== "function") throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_VISUAL_OVERRIDE_UNSUPPORTED");
      const food = await repository.getFoodByIdAdmin(item.food_id);
      if (!food) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_FOOD_NOT_FOUND");
      const previousVisualType = food.visualType ?? food.visual_type ?? null;
      await repository.updateFood(item.food_id, { visualType: override });
      try {
        const job = await jobs.regenerate(userId, item.food_id, {
          reason: "旧图审计确认需要重新生图",
          extraPrompt: "使用最新食物视觉形态提示词重新生成，旧图审计确认主体不符合预期。",
        });
        const jobId = getJobId(job);
        if (!jobId) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_REGENERATION_JOB_INVALID");
        return writeItem(itemId, {
          status: "regeneration_requested",
          operator_decision: "regenerate",
          regeneration_job_id: jobId,
        });
      } catch (error) {
        await repository.updateFood(item.food_id, { visualType: previousVisualType });
        throw error;
      }
    }
    const job = await jobs.regenerate(userId, item.food_id, {
      reason: "旧图审计确认需要重新生图",
      extraPrompt: "使用最新食物视觉形态提示词重新生成，旧图审计确认主体不符合预期。",
    });
    const jobId = getJobId(job);
    if (!jobId) throw new FoodImageAuditError("FOOD_IMAGE_AUDIT_REGENERATION_JOB_INVALID");
    return writeItem(itemId, {
      status: "regeneration_requested",
      operator_decision: "regenerate",
      regeneration_job_id: jobId,
    });
  }

  return { previewHighRisk, listRun, reviewItems, keepItem, requestRegeneration };
}

module.exports = {
  HIGH_RISK_PROCESSED_TYPES,
  REVIEWED_ITEM_STATUSES,
  FoodImageAuditError,
  createFoodImageAuditService,
};
