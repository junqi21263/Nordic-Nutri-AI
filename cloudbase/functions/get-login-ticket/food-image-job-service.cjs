// food-image-job-service.cjs
// Admin-gated Hunyuan food image job queue: create → claim → generate →
// download → Storage persist → review. Never blocks public food search.

const crypto = require("node:crypto");
const { buildFoodImagePrompt } = require("./food-image-prompts.cjs");
const { createFoodStorageUrlResolver } = require("./food-storage-url-service.cjs");
const { resolveVisualProfile } = require("./food-image-visual-profile.cjs");

class FoodImageJobError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function todayUtcDate() {
  return new Date().toISOString().slice(0, 10);
}

function shouldTriggerWorker({ deferWorker = false } = {}) {
  return deferWorker !== true;
}

function mapJobRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id,
    foodId: row.food_id,
    jobType: row.job_type,
    status: row.status,
    prompt: row.prompt ?? null,
    modelName: row.model_name ?? null,
    candidateCount: Number(row.candidate_count) || 0,
    generatedCount: Number(row.generated_count) || 0,
    attemptCount: Number(row.attempt_count) || 0,
    maxAttempts: Number(row.max_attempts) || 3,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    extraPrompt: row.extra_prompt ?? null,
    cookingMethod: row.cooking_method ?? null,
    servingDescription: row.serving_description ?? null,
    visualProfileId: row.visual_profile_id ?? null,
    visualProfileKey: row.visual_profile_key ?? "standard",
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function createFoodImageJobService({
  db,
  repository,
  hunyuan,
  imageService,
  config = {},
  triggerWorker,
} = {}) {
  if (!db || !repository) throw new Error("Food image job service requires db + repository");

  const candidateDefault = Math.min(Math.max(Number(config.candidateCount) || 3, 1), 6);
  const concurrency = Math.min(Math.max(Number(config.concurrency) || 2, 1), 5);
  const dailyLimit = Math.min(Math.max(Number(config.dailyLimit) || 500, 1), 5000);
  const storagePrefix = config.storagePrefix || "food-library";
  const imageUrlResolver = createFoodStorageUrlResolver({ baseUrl: config.imageCdnBaseUrl });
  const generationEnabled = config.generationEnabled !== false;

  async function requireAdmin(userId) {
    if (!userId) throw new FoodImageJobError("UNAUTHORIZED");
    const ok = await repository.isAdmin(userId);
    if (!ok) throw new FoodImageJobError("FORBIDDEN");
  }

  async function getDailyUsage() {
    const date = todayUtcDate();
    const result = await db.from("food_image_usage_daily").select("generated_count").eq("usage_date", date).maybeSingle();
    return Number(result.data?.generated_count) || 0;
  }

  async function incrementDailyUsage(count) {
    if (!count) return;
    const date = todayUtcDate();
    const existing = await db.from("food_image_usage_daily").select("generated_count").eq("usage_date", date).maybeSingle();
    if (existing.data) {
      await db.from("food_image_usage_daily").update({
        generated_count: Number(existing.data.generated_count || 0) + count,
        updated_at: new Date().toISOString(),
      }).eq("usage_date", date);
      return;
    }
    await db.from("food_image_usage_daily").insert({
      usage_date: date,
      generated_count: count,
      updated_at: new Date().toISOString(),
    });
  }

  async function findActiveJob(foodId, visualProfileId = null) {
    const result = await db.from("food_image_jobs")
      .select("*")
      .eq("food_id", foodId)
      .eq("visual_profile_id", visualProfileId)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return result.data ?? null;
  }

  async function ensureVisualProfile(food, requestedProfileKey = "auto") {
    const definition = resolveVisualProfile(food, requestedProfileKey);
    const ownerFoodId = food.imageOwnerFoodId || food.id;
    const existing = await db.from("food_image_visual_profiles").select("*")
      .eq("food_id", ownerFoodId).eq("profile_key", definition.key).maybeSingle();
    if (existing.error) throw new FoodImageJobError("FOOD_IMAGE_PROFILE_LOOKUP_FAILED");
    if (existing.data) return { food, profile: existing.data, definition };
    const currentDefault = await db.from("food_image_visual_profiles").select("id")
      .eq("food_id", ownerFoodId).eq("is_default", true).maybeSingle();
    if (currentDefault.error) throw new FoodImageJobError("FOOD_IMAGE_PROFILE_LOOKUP_FAILED");
    const inserted = await db.from("food_image_visual_profiles").insert({
      food_id: ownerFoodId,
      profile_key: definition.key,
      label_zh: definition.labelZh,
      prompt_hint: definition.promptHint,
      // A nutrition variant must never silently replace the canonical default
      // image. Extra states (for example cooked chicken breast) are additions.
      is_default: !currentDefault.data && ownerFoodId === food.id && definition.key === (food.visualProfileKey || "standard"),
      status: "missing",
    }).select("*").maybeSingle();
    if (inserted.error || !inserted.data) throw new FoodImageJobError("FOOD_IMAGE_PROFILE_CREATE_FAILED");
    return { food, profile: inserted.data, definition };
  }

  async function profileHasApprovedPrimary(profile) {
    if (profile?.primary_image_id) return true;
    const images = await db.from("food_images")
      .select("id,is_primary,review_status,status")
      .eq("visual_profile_id", profile.id)
      .eq("is_primary", true)
      .limit(1);
    const primary = images.data?.[0];
    const approved = primary && (primary.review_status === "approved" || primary.status === "ready");
    return Boolean(approved);
  }

  async function createJob(userId, {
    foodId,
    candidateCount,
    force = false,
    jobType = "generate",
    reason,
    extraPrompt,
    cookingMethod,
    servingDescription,
    visualProfileKey = "auto",
    deferWorker = false,
  } = {}) {
    await requireAdmin(userId);
    if (!generationEnabled) throw new FoodImageJobError("HY_IMAGE_DISABLED");
    if (!foodId) throw new FoodImageJobError("FOOD_ID_REQUIRED");
    if (!hunyuan) throw new FoodImageJobError("HY_IMAGE_UNAVAILABLE");

    const usage = await getDailyUsage();
    if (usage >= dailyLimit) throw new FoodImageJobError("HY_IMAGE_DAILY_LIMIT");

    const sourceFood = await repository.getFoodById(foodId);
    if (!sourceFood) throw new FoodImageJobError("FOOD_NOT_FOUND");
    const { food, profile, definition } = await ensureVisualProfile(sourceFood, visualProfileKey);
    const hasPrimary = await profileHasApprovedPrimary(profile);
    if (!food) throw new FoodImageJobError("FOOD_NOT_FOUND");
    if (hasPrimary && !force && jobType !== "regenerate") {
      throw new FoodImageJobError("FOOD_IMAGE_ALREADY_READY");
    }

    const active = await findActiveJob(profile.food_id, profile.id);
    if (active) throw new FoodImageJobError("FOOD_IMAGE_JOB_ACTIVE");

    const count = Math.min(Math.max(Number(candidateCount) || candidateDefault, 1), 6);
    const prompt = buildFoodImagePrompt({
      foodNameZh: food.nameZh,
      foodNameEn: food.nameEn,
      category: food.category?.nameZh || food.category?.code,
      cookingMethod: cookingMethod || (reason?.includes("水煮") ? "水煮" : undefined),
      servingDescription,
      extraPrompt: extraPrompt || (jobType === "regenerate" ? reason : undefined),
      visualProfileKey: definition.key,
    });

    const inserted = await db.from("food_image_jobs").insert({
      food_id: profile.food_id,
      visual_profile_id: profile.id,
      visual_profile_key: definition.key,
      job_type: jobType,
      status: "pending",
      prompt,
      model_name: hunyuan.modelName,
      candidate_count: count,
      generated_count: 0,
      attempt_count: 0,
      max_attempts: Number(config.maxAttempts) || 3,
      extra_prompt: extraPrompt ? String(extraPrompt).slice(0, 300) : null,
      cooking_method: cookingMethod ? String(cookingMethod).slice(0, 40) : null,
      serving_description: servingDescription ? String(servingDescription).slice(0, 80) : null,
      created_by: userId,
    }).select("*").maybeSingle();

    if (inserted.error || !inserted.data) throw new FoodImageJobError("FOOD_IMAGE_JOB_CREATE_FAILED");

    await db.from("food_image_visual_profiles").update({ status: "generating" }).eq("id", profile.id);
    await db.from("foods").update({ image_status: "generating" }).eq("id", profile.food_id);

    const job = mapJobRow(inserted.data);
    if (shouldTriggerWorker({ deferWorker }) && typeof triggerWorker === "function") {
      Promise.resolve(triggerWorker({ jobId: job.id })).catch((err) => {
        console.error("[food-image-jobs] trigger worker failed:", err?.message || err);
      });
    }
    return job;
  }

  async function createBatch(userId, {
    foodIds = [],
    candidateCount,
    onlyMissing = true,
    force = false,
    visualProfileKey = "auto",
  } = {}) {
    await requireAdmin(userId);
    const ids = Array.from(new Set((Array.isArray(foodIds) ? foodIds : []).filter(Boolean)));
    if (!ids.length) throw new FoodImageJobError("FOOD_IDS_REQUIRED");
    if (ids.length > 100) throw new FoodImageJobError("FOOD_IMAGE_BATCH_TOO_LARGE");

    let created = 0;
    let skipped = 0;
    let failed = 0;
    const jobs = [];
    for (const foodId of ids) {
      try {
        if (onlyMissing && !force) {
          const food = await repository.getFoodById(foodId);
          const target = food ? await ensureVisualProfile(food, visualProfileKey) : null;
          const hasPrimary = target ? await profileHasApprovedPrimary(target.profile) : false;
          if (hasPrimary) { skipped += 1; continue; }
        }
        const food = await repository.getFoodById(foodId);
        const target = food ? await ensureVisualProfile(food, visualProfileKey) : null;
        const active = target ? await findActiveJob(target.profile.food_id, target.profile.id) : null;
        if (active) { skipped += 1; continue; }
        const job = await createJob(userId, { foodId, candidateCount, force, jobType: "generate", visualProfileKey });
        jobs.push(job);
        created += 1;
      } catch (error) {
        if (error?.code === "FOOD_IMAGE_JOB_ACTIVE" || error?.code === "FOOD_IMAGE_ALREADY_READY") {
          skipped += 1;
        } else {
          failed += 1;
        }
      }
    }
    return { created, skipped, failed, jobs, estimatedImages: created * (Number(candidateCount) || candidateDefault) };
  }

  async function listJobs(userId, { status, foodId, page = 1, pageSize = 20 } = {}) {
    await requireAdmin(userId);
    const limit = Math.min(Math.max(Number(pageSize) || 20, 1), 100);
    const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
    let query = db.from("food_image_jobs").select("*").order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (status) query = query.eq("status", status);
    if (foodId) query = query.eq("food_id", foodId);
    const result = await query;
    if (result.error) throw new FoodImageJobError("FOOD_IMAGE_JOB_LIST_FAILED");
    return { items: (result.data ?? []).map(mapJobRow), page: Number(page) || 1, pageSize: limit };
  }

  async function getJob(userId, jobId) {
    await requireAdmin(userId);
    const result = await db.from("food_image_jobs").select("*").eq("id", jobId).maybeSingle();
    if (result.error || !result.data) throw new FoodImageJobError("FOOD_IMAGE_JOB_NOT_FOUND");
    const images = await db.from("food_images").select("*").eq("job_id", jobId).order("created_at", { ascending: true });
    const { mapImageRow } = require("./food-repository.cjs");
    return {
      job: mapJobRow(result.data),
      candidates: (images.data ?? []).map((row) => mapImageRow(row, { imageUrlResolver })).filter(Boolean),
    };
  }

  async function claimPendingJobs(limit = concurrency) {
    const result = await db.from("food_image_jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(Math.min(Math.max(Number(limit) || concurrency, 1), concurrency));
    const rows = result.data ?? [];
    const claimed = [];
    for (const row of rows) {
      const updated = await db.from("food_image_jobs").update({
        status: "processing",
        started_at: row.started_at || new Date().toISOString(),
        attempt_count: Number(row.attempt_count || 0) + 1,
      }).eq("id", row.id).eq("status", "pending").select("*").maybeSingle();
      if (updated.data) claimed.push(updated.data);
    }
    return claimed;
  }

  async function processJobRow(row) {
    if (!hunyuan || !imageService) throw new FoodImageJobError("HY_IMAGE_UNAVAILABLE");
    const food = await repository.getFoodById(row.food_id);
    if (!food) {
      await db.from("food_image_jobs").update({
        status: "failed",
        error_code: "FOOD_NOT_FOUND",
        error_message: "food missing",
        finished_at: new Date().toISOString(),
      }).eq("id", row.id);
      return { jobId: row.id, generated: 0, failed: true };
    }

    const target = Number(row.candidate_count) || candidateDefault;
    let generated = Number(row.generated_count) || 0;
    let failures = 0;
    let lastCandidateError = "";

    while (generated < target) {
      const imageId = crypto.randomUUID();
      try {
        const generatedImage = await hunyuan.generateOne({
          foodNameZh: food.nameZh,
          foodNameEn: food.nameEn,
          category: food.category?.nameZh || food.category?.code,
          cookingMethod: row.cooking_method,
          servingDescription: row.serving_description,
          extraPrompt: row.extra_prompt,
          visualProfileKey: row.visual_profile_key,
        });
        const downloaded = await hunyuan.downloadGeneratedImage(generatedImage.temporaryUrl);
        const persisted = await imageService.persistGeneratedImage({
          buffer: downloaded.buffer,
          mimeType: downloaded.mimeType,
          foodId: food.id,
          imageId,
          storagePrefix,
        });
        hunyuan.validateGeneratedResult({
          temporaryUrl: generatedImage.temporaryUrl,
          fileId: persisted.originalFileId,
          storagePath: persisted.storagePath,
          detailUrl: persisted.detailUrl,
          originalUrl: persisted.originalUrl,
        });

        await db.from("food_images").insert({
          id: imageId,
          food_id: food.id,
          visual_profile_id: row.visual_profile_id,
          image_entity_key: food.imageEntityKey || food.sourceId,
          image_type: "candidate",
          source: "hunyuan",
          source_url: null, // never persist temporary Hunyuan URL
          storage_path: persisted.storagePath,
          original_file_id: persisted.originalFileId,
          original_url: persisted.originalUrl,
          thumb_url: persisted.thumbUrl,
          medium_url: persisted.mediumUrl,
          detail_url: persisted.detailUrl,
          mime_type: persisted.mimeType,
          width: persisted.width,
          height: persisted.height,
          file_size: persisted.fileSize,
          content_hash: persisted.contentHash,
          model_name: generatedImage.modelName,
          prompt: generatedImage.prompt,
          revised_prompt: generatedImage.revisedPrompt,
          is_primary: false,
          is_verified: false,
          status: "pending",
          review_status: "pending",
          job_id: row.id,
        });

        generated += 1;
        await incrementDailyUsage(1);
        await db.from("food_image_jobs").update({ generated_count: generated }).eq("id", row.id);
      } catch (error) {
        failures += 1;
        lastCandidateError = [
          error?.code,
          error?.message || String(error),
        ].filter(Boolean).join(": ").slice(0, 800);
        console.error("[food-image-jobs] candidate failed:", lastCandidateError);
        if (failures >= 3 && generated === 0) break;
      }
    }

    if (generated > 0) {
      await db.from("food_image_jobs").update({
        status: "reviewing",
        generated_count: generated,
        finished_at: new Date().toISOString(),
        error_code: null,
        error_message: null,
      }).eq("id", row.id);
      if (row.visual_profile_id) await db.from("food_image_visual_profiles").update({ status: "reviewing" }).eq("id", row.visual_profile_id);
      await db.from("foods").update({ image_status: "reviewing" }).eq("id", food.id);
      return { jobId: row.id, generated, failed: false };
    }

    const attempts = Number(row.attempt_count || 0);
    const maxAttempts = Number(row.max_attempts || 3);
    if (attempts < maxAttempts) {
      await db.from("food_image_jobs").update({
        status: "pending",
        error_code: "HY_IMAGE_RETRY",
        error_message: lastCandidateError || "no candidates generated; will retry",
      }).eq("id", row.id);
      return {
        jobId: row.id,
        generated: 0,
        failed: true,
        errorCode: "HY_IMAGE_RETRY",
        errorMessage: lastCandidateError || "no candidates generated; will retry",
      };
    }
    await db.from("food_image_jobs").update({
      status: "failed",
      error_code: "HY_IMAGE_FAILED",
      error_message: lastCandidateError || "exhausted retries with zero candidates",
      finished_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (row.visual_profile_id) await db.from("food_image_visual_profiles").update({ status: "failed" }).eq("id", row.visual_profile_id);
    await db.from("foods").update({ image_status: "failed" }).eq("id", food.id);
    return {
      jobId: row.id,
      generated: 0,
      failed: true,
      errorCode: "HY_IMAGE_FAILED",
      errorMessage: lastCandidateError || "exhausted retries with zero candidates",
    };
  }

  async function processQueue(userId, { jobId } = {}) {
    // Worker may be invoked by timer without a user — require admin when userId present.
    if (userId) await requireAdmin(userId);
    if (!generationEnabled) return { processed: 0, results: [] };

    if (jobId) {
      const result = await db.from("food_image_jobs").select("*").eq("id", jobId).maybeSingle();
      if (!result.data) throw new FoodImageJobError("FOOD_IMAGE_JOB_NOT_FOUND");
      if (result.data.status === "pending") {
        await db.from("food_image_jobs").update({
          status: "processing",
          started_at: new Date().toISOString(),
          attempt_count: Number(result.data.attempt_count || 0) + 1,
        }).eq("id", jobId).eq("status", "pending");
      }
      const refreshed = await db.from("food_image_jobs").select("*").eq("id", jobId).maybeSingle();
      if (refreshed.data?.status !== "processing") {
        return { processed: 0, results: [] };
      }
      const one = await processJobRow(refreshed.data);
      return { processed: 1, results: [one] };
    }

    const claimed = await claimPendingJobs(concurrency);
    const results = [];
    for (const row of claimed) {
      results.push(await processJobRow(row));
    }
    return { processed: results.length, results };
  }

  async function approveImage(userId, imageId) {
    await requireAdmin(userId);
    const imageResult = await db.from("food_images").select("*").eq("id", imageId).maybeSingle();
    const image = imageResult.data;
    if (!image?.food_id) throw new FoodImageJobError("FOOD_IMAGE_NOT_FOUND");

    const profileId = image.visual_profile_id ?? null;
    let clearPrimary = db.from("food_images").update({ is_primary: false });
    clearPrimary = profileId ? clearPrimary.eq("visual_profile_id", profileId) : clearPrimary.eq("food_id", image.food_id);
    await clearPrimary.eq("is_primary", true);
    await db.from("food_images").update({
      is_primary: true,
      is_verified: true,
      status: "ready",
      review_status: "approved",
      image_type: "primary",
    }).eq("id", imageId);
    if (profileId) {
      const profileResult = await db.from("food_image_visual_profiles").select("*").eq("id", profileId).maybeSingle();
      const profile = profileResult.data;
      await db.from("food_image_visual_profiles").update({ primary_image_id: imageId, status: "ready" }).eq("id", profileId);
      if (profile?.is_default) await db.from("foods").update({
        primary_image_id: imageId,
        image_status: "ready",
        image_quality_score: image.quality_score == null ? 80 : Number(image.quality_score),
      }).eq("id", image.food_id);
    } else {
    await db.from("foods").update({
      primary_image_id: imageId,
      image_status: "ready",
      image_quality_score: image.quality_score == null ? 80 : Number(image.quality_score),
    }).eq("id", image.food_id);
    }

    if (image.job_id) {
      await db.from("food_image_jobs").update({
        status: "completed",
        finished_at: new Date().toISOString(),
      }).eq("id", image.job_id);
      await db.from("food_image_batch_items").update({
        status: "completed",
        error_code: null,
        error_message: null,
        next_retry_at: null,
      }).eq("job_id", image.job_id);
    }
    return { imageId, foodId: image.food_id, jobId: image.job_id ?? null, visualProfileId: profileId, approved: true };
  }

  async function rejectImage(userId, imageId, { reason } = {}) {
    await requireAdmin(userId);
    const imageResult = await db.from("food_images").select("*").eq("id", imageId).maybeSingle();
    const image = imageResult.data;
    if (!image) throw new FoodImageJobError("FOOD_IMAGE_NOT_FOUND");
    if (image.is_primary) throw new FoodImageJobError("FOOD_IMAGE_PRIMARY_LOCKED");
    const reviewReason = String(reason || "审核未通过，请准确还原食材主体、形态与质地").trim().slice(0, 500);
    await db.from("food_images").update({
      status: "rejected",
      review_status: "rejected",
      reject_reason: reviewReason,
    }).eq("id", imageId);
    if (image.job_id) {
      await db.from("food_image_batch_items").update({
        status: "needs_retry",
        last_image_id: imageId,
        retry_reason: reviewReason,
        error_code: "FOOD_IMAGE_REJECTED",
        error_message: reviewReason,
        next_retry_at: null,
        locked_at: null,
        locked_by: null,
      }).eq("job_id", image.job_id);
    }
    return { imageId, foodId: image.food_id, jobId: image.job_id ?? null, rejected: true };
  }

  async function regenerate(userId, foodId, { reason, extraPrompt, cookingMethod, candidateCount } = {}) {
    return createJob(userId, {
      foodId,
      force: true,
      jobType: "regenerate",
      reason,
      extraPrompt,
      cookingMethod,
      candidateCount: candidateCount || candidateDefault,
    });
  }

  async function getStats(userId) {
    await requireAdmin(userId);
    const [missing, pendingJobs, processingJobs, pendingImages, readyFoods, failedJobs, usage] = await Promise.all([
      db.from("foods").select("id", { count: "exact", head: true }).eq("is_active", true).eq("image_status", "missing"),
      db.from("food_image_jobs").select("id", { count: "exact", head: true }).eq("status", "pending"),
      db.from("food_image_jobs").select("id", { count: "exact", head: true }).eq("status", "processing"),
      db.from("food_images").select("id", { count: "exact", head: true }).eq("review_status", "pending").eq("source", "hunyuan"),
      db.from("foods").select("id", { count: "exact", head: true }).eq("image_status", "ready"),
      db.from("food_image_jobs").select("id", { count: "exact", head: true }).eq("status", "failed"),
      getDailyUsage(),
    ]);
    return {
      missingImages: missing.count ?? 0,
      pendingJobs: pendingJobs.count ?? 0,
      processingJobs: processingJobs.count ?? 0,
      pendingReviewImages: pendingImages.count ?? 0,
      readyFoods: readyFoods.count ?? 0,
      failedJobs: failedJobs.count ?? 0,
      dailyGenerated: usage,
      dailyLimit,
    };
  }

  return {
    createJob,
    createBatch,
    listJobs,
    getJob,
    processQueue,
    approveImage,
    rejectImage,
    regenerate,
    getStats,
    getDailyUsage,
    mapJobRow,
  };
}

module.exports = {
  FoodImageJobError,
  createFoodImageJobService,
  mapJobRow,
  todayUtcDate,
  shouldTriggerWorker,
};
