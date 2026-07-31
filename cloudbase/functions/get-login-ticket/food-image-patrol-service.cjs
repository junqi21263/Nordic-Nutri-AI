// Automatic category watches: create and start image batches under the daily
// generation quota. Candidate selection reuses listBatchImageCandidates, which
// skips foods that already have an approved primary for the requested visual profile.

const { normalizeVisualProfileKey } = require("./food-image-visual-profile.cjs");

const PATROL_DAILY_CAP = 500;
const DEFAULT_INTERVAL_MINUTES = 60;
const MIN_INTERVAL_MINUTES = 30;
const MAX_INTERVAL_MINUTES = 24 * 60;

class FoodImagePatrolError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function clampInt(value, fallback, min, max) {
  return Math.min(Math.max(Number(value) || fallback, min), max);
}

function normalizeIntervalMinutes(value) {
  return clampInt(value, DEFAULT_INTERVAL_MINUTES, MIN_INTERVAL_MINUTES, MAX_INTERVAL_MINUTES);
}

function ruleIntervalMs(rule) {
  return normalizeIntervalMinutes(rule?.interval_minutes ?? rule?.intervalMinutes) * 60 * 1000;
}

function formatIntervalLabel(minutes) {
  const value = normalizeIntervalMinutes(minutes);
  if (value % 60 === 0) {
    const hours = value / 60;
    return hours === 1 ? "每 1 小时" : `每 ${hours} 小时`;
  }
  return `每 ${value} 分钟`;
}

function mapRuleRow(row, category = null) {
  if (!row?.id) return null;
  const intervalMinutes = normalizeIntervalMinutes(row.interval_minutes);
  return {
    id: row.id,
    categoryId: row.category_id,
    categoryNameZh: category?.name_zh || category?.nameZh || null,
    categoryCode: category?.code || null,
    visualProfileKey: row.visual_profile_key || "auto",
    batchSize: Number(row.batch_size) || 20,
    intervalMinutes,
    intervalLabel: formatIntervalLabel(intervalMinutes),
    enabled: row.enabled !== false,
    createdBy: row.created_by,
    lastRunAt: row.last_run_at ?? null,
    lastBatchId: row.last_batch_id ?? null,
    lastError: row.last_error ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function createFoodImagePatrolService({ db, repository, batches, jobs, dailyCap = PATROL_DAILY_CAP } = {}) {
  if (!db || !repository || !batches || !jobs) {
    throw new Error("Food image patrol service requires db, repository, batches, and jobs");
  }
  const hardDailyCap = clampInt(dailyCap, PATROL_DAILY_CAP, 1, PATROL_DAILY_CAP);

  async function requireAdmin(userId) {
    if (!userId) throw new FoodImagePatrolError("UNAUTHORIZED");
    if (!await repository.isAdmin(userId)) throw new FoodImagePatrolError("FORBIDDEN");
  }

  async function loadCategory(categoryId) {
    const result = await db.from("food_categories").select("id,code,name_zh").eq("id", categoryId).maybeSingle();
    return result.data || null;
  }

  async function listRules(userId) {
    await requireAdmin(userId);
    const result = await db.from("food_image_patrol_rules").select("*")
      .order("created_at", { ascending: true });
    if (result.error) throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_LIST_FAILED", result.error.message);
    const items = [];
    for (const row of result.data || []) {
      items.push(mapRuleRow(row, await loadCategory(row.category_id)));
    }
    return { items, dailyCap: hardDailyCap };
  }

  async function upsertRule(userId, input = {}) {
    await requireAdmin(userId);
    const categoryId = String(input.categoryId || "").trim();
    if (!categoryId) throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_CATEGORY_REQUIRED");
    const category = await loadCategory(categoryId);
    if (!category) throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_CATEGORY_INVALID");
    const visualProfileKey = normalizeVisualProfileKey(input.visualProfileKey);
    const batchSize = clampInt(input.batchSize, 20, 1, 100);
    const intervalMinutes = normalizeIntervalMinutes(input.intervalMinutes);
    const enabled = input.enabled === false ? false : true;
    const existing = await db.from("food_image_patrol_rules").select("*")
      .eq("category_id", categoryId)
      .eq("visual_profile_key", visualProfileKey)
      .maybeSingle();
    if (existing.data) {
      const updated = await db.from("food_image_patrol_rules").update({
        batch_size: batchSize,
        interval_minutes: intervalMinutes,
        enabled,
        last_error: null,
      }).eq("id", existing.data.id).select("*").maybeSingle();
      if (updated.error || !updated.data) {
        throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_UPDATE_FAILED", updated.error?.message);
      }
      return mapRuleRow(updated.data, category);
    }
    const inserted = await db.from("food_image_patrol_rules").insert({
      category_id: categoryId,
      visual_profile_key: visualProfileKey,
      batch_size: batchSize,
      interval_minutes: intervalMinutes,
      enabled,
      created_by: userId,
    }).select("*").maybeSingle();
    if (inserted.error || !inserted.data) {
      throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_CREATE_FAILED", inserted.error?.message);
    }
    return mapRuleRow(inserted.data, category);
  }

  async function deleteRule(userId, ruleId) {
    await requireAdmin(userId);
    const id = String(ruleId || "").trim();
    if (!id) throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_RULE_REQUIRED");
    const result = await db.from("food_image_patrol_rules").delete().eq("id", id);
    if (result.error) throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_DELETE_FAILED", result.error.message);
    return { deleted: true, id };
  }

  async function setEnabled(userId, ruleId, enabled) {
    await requireAdmin(userId);
    const updated = await db.from("food_image_patrol_rules").update({
      enabled: Boolean(enabled),
    }).eq("id", ruleId).select("*").maybeSingle();
    if (updated.error || !updated.data) {
      throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_UPDATE_FAILED", updated.error?.message);
    }
    return mapRuleRow(updated.data, await loadCategory(updated.data.category_id));
  }

  async function remainingQuota(userId = null) {
    if (userId) await requireAdmin(userId);
    const usage = typeof jobs.getDailyUsage === "function" ? await jobs.getDailyUsage() : 0;
    const jobLimit = Number(jobs.dailyLimit) || hardDailyCap;
    const limit = Math.min(hardDailyCap, jobLimit);
    return {
      usage: Number(usage) || 0,
      limit,
      remaining: Math.max(0, limit - (Number(usage) || 0)),
    };
  }

  async function hasActiveCategoryBatch(categoryId, visualProfileKey) {
    const result = await db.from("food_image_batches").select("id,status,selection_json")
      .in("status", ["draft", "running", "paused"])
      .order("created_at", { ascending: false })
      .limit(40);
    if (result.error) return false;
    const profile = normalizeVisualProfileKey(visualProfileKey);
    return (result.data || []).some((row) => {
      const selection = row.selection_json || {};
      if (String(selection.categoryId || "") !== String(categoryId)) return false;
      const selectionProfile = normalizeVisualProfileKey(selection.visualProfileKey);
      return selectionProfile === profile || (profile === "auto" && !selection.visualProfileKey);
    });
  }

  async function runRule(rule, remaining, { force = false } = {}) {
    if (remaining <= 0) return { skipped: true, reason: "daily_cap", message: "今日生图额度已用尽" };
    const intervalMs = ruleIntervalMs(rule);
    if (!force && rule.last_run_at) {
      const elapsed = Date.now() - new Date(rule.last_run_at).getTime();
      if (Number.isFinite(elapsed) && elapsed < intervalMs) {
        const minutes = Math.ceil((intervalMs - elapsed) / 60000);
        const label = formatIntervalLabel(rule.interval_minutes);
        return {
          skipped: true,
          reason: "interval",
          message: `未到巡检间隔（${label}），约 ${minutes} 分钟后再由定时器执行`,
        };
      }
    }
    if (await hasActiveCategoryBatch(rule.category_id, rule.visual_profile_key)) {
      return { skipped: true, reason: "active_batch", message: "该分类已有草稿/运行中/暂停的批次" };
    }
    const count = Math.min(Number(rule.batch_size) || 20, remaining, 100);
    if (count < 1) return { skipped: true, reason: "daily_cap", message: "今日生图额度已用尽" };
    const category = await loadCategory(rule.category_id);
    const nameZh = category?.name_zh || "分类";
    const profile = normalizeVisualProfileKey(rule.visual_profile_key);
    let batch;
    try {
      batch = await batches.createFromCategory(rule.created_by, {
        categoryId: rule.category_id,
        count,
        name: `自动巡检-${nameZh}-${profile}`,
        visualProfileKey: profile,
        concurrency: 2,
        maxAttempts: 3,
      });
    } catch (error) {
      if (error?.code === "FOOD_IMAGE_BATCH_SELECTION_EMPTY") {
        const message = `${nameZh} 在「${profile}」状态下暂无缺主图候选（均已有通过主图或无可发布食物）`;
        await db.from("food_image_patrol_rules").update({
          last_run_at: new Date().toISOString(),
          last_error: message,
        }).eq("id", rule.id);
        return { skipped: true, reason: "no_candidates", message };
      }
      throw error;
    }
    await batches.start(rule.created_by, batch.id);
    await db.from("food_image_patrol_rules").update({
      last_run_at: new Date().toISOString(),
      last_batch_id: batch.id,
      last_error: null,
    }).eq("id", rule.id);
    return {
      created: true,
      batchId: batch.id,
      count: Number(batch.totalCount) || count,
      categoryId: rule.category_id,
      visualProfileKey: profile,
    };
  }

  async function rememberSkip(ruleId, message) {
    if (!ruleId || !message) return;
    await db.from("food_image_patrol_rules").update({
      last_error: String(message).slice(0, 800),
    }).eq("id", ruleId);
  }

  async function runTrusted({ force = false } = {}) {
    const quota = await remainingQuota();
    if (quota.remaining <= 0) {
      return { created: [], skipped: [{ reason: "daily_cap", message: "今日生图额度已用尽" }], quota };
    }
    const rules = await db.from("food_image_patrol_rules").select("*")
      .eq("enabled", true)
      .order("last_run_at", { ascending: true, nullsFirst: true })
      .limit(20);
    if (rules.error) throw new FoodImagePatrolError("FOOD_IMAGE_PATROL_LIST_FAILED", rules.error.message);
    if (!(rules.data || []).length) {
      return { created: [], skipped: [{ reason: "no_rules", message: "没有启用中的巡检规则，请先添加规则" }], quota };
    }

    const created = [];
    const skipped = [];
    let remaining = quota.remaining;
    for (const rule of rules.data || []) {
      if (remaining <= 0) {
        skipped.push({ ruleId: rule.id, reason: "daily_cap", message: "今日生图额度已用尽" });
        continue;
      }
      try {
        const outcome = await runRule(rule, remaining, { force });
        if (outcome.created) {
          created.push(outcome);
          remaining = Math.max(0, remaining - (outcome.count || 0));
        } else {
          // Persist durable skips; interval waits are expected and noisy.
          if (outcome.reason !== "no_candidates" && outcome.reason !== "interval" && outcome.message) {
            await rememberSkip(rule.id, outcome.message);
          }
          skipped.push({
            ruleId: rule.id,
            reason: outcome.reason || "skipped",
            message: outcome.message || null,
          });
        }
      } catch (error) {
        const message = String(error?.message || error).slice(0, 800);
        await db.from("food_image_patrol_rules").update({
          last_run_at: new Date().toISOString(),
          last_error: message,
        }).eq("id", rule.id);
        skipped.push({ ruleId: rule.id, reason: error?.code || "error", message });
      }
    }
    return { created, skipped, quota: { ...quota, remaining } };
  }

  async function runNow(userId) {
    await requireAdmin(userId);
    // Manual runs skip the configured interval used by the timer dispatcher.
    return runTrusted({ force: true });
  }

  return {
    listRules,
    upsertRule,
    deleteRule,
    setEnabled,
    remainingQuota,
    runTrusted,
    runNow,
    dailyCap: hardDailyCap,
  };
}

module.exports = {
  PATROL_DAILY_CAP,
  DEFAULT_INTERVAL_MINUTES,
  MIN_INTERVAL_MINUTES,
  MAX_INTERVAL_MINUTES,
  FoodImagePatrolError,
  createFoodImagePatrolService,
  mapRuleRow,
  normalizeIntervalMinutes,
  formatIntervalLabel,
};
