// food-admin-service.cjs
// Admin-only operations: USDA import (idempotent, dry-run), image sync for a
// food, image review, food patch, set-primary-image, missing-images listing,
// sync-jobs listing. Every method requires an admin userId verified by the
// repository; callers must also gate at the route layer.

class FoodAdminError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function createFoodAdminService({ repository, usdaService, normalizer, imageService }) {
  async function requireAdmin(userId) {
    if (!userId) throw new FoodAdminError("UNAUTHORIZED");
    const ok = await repository.isAdmin(userId);
    if (!ok) throw new FoodAdminError("FORBIDDEN");
  }

  return {
    async importUsda(userId, { query, dataTypes, pageSize = 50, maxItems = 200, categoryCode, dryRun = false } = {}) {
      await requireAdmin(userId);
      if (!usdaService) throw new FoodAdminError("USDA_UNAVAILABLE");
      const q = String(query ?? "").trim();
      if (q.length < 2 || q.length > 80) throw new FoodAdminError("FOOD_QUERY_INVALID");
      const cap = Math.min(Math.max(Number(maxItems) || 50, 1), 500);

      let job = null;
      if (!dryRun) job = await repository.createSyncJob({ jobType: "usda_import", source: "usda", status: "running", startedAt: new Date().toISOString(), requestPayload: { query: q, dataTypes, maxItems: cap } });

      let success = 0, failed = 0, skipped = 0, total = 0;
      let page = 1;
      const seen = new Set();
      try {
        while (total < cap) {
          const result = await usdaService.search({ query: q, page, pageSize: Math.min(pageSize, cap - total), dataTypes });
          for (const food of result.foods) {
            total += 1;
            const key = `${food.source}:${food.sourceId}`;
            if (seen.has(key)) { skipped += 1; continue; }
            seen.add(key);
            if (dryRun) { success += 1; continue; }
            try {
              const normalized = normalizer.normalizeFoodRecord({
                name_en: food.name_en,
                brand_name: food.brandName,
                description: food.description,
                calories: food.calories,
                protein_g: food.protein_g,
                carbs_g: food.carbs_g,
                fat_g: food.fat_g,
                fiber_g: food.fiber_g,
                sugar_g: food.sugar_g,
                sodium_mg: food.sodium_mg,
              }, { categoryCode });
              const inserted = await repository.upsertFood({
                source: "usda",
                sourceId: food.sourceId,
                fdcId: food.fdcId,
                nameZh: null,
                nameEn: food.name_en,
                normalizedName: normalized.normalized_name,
                brandName: normalized.brand_name,
                description: food.description,
                searchKeywords: normalized.search_keywords,
                calories: normalized.nutrition.calories,
                proteinG: normalized.nutrition.protein_g,
                carbsG: normalized.nutrition.carbs_g,
                fatG: normalized.nutrition.fat_g,
                fiberG: normalized.nutrition.fiber_g,
                sugarG: normalized.nutrition.sugar_g,
                sodiumMg: normalized.nutrition.sodium_mg,
                nutritionBasis: "per_100g",
                qualityScore: 80,
                isVerified: true,
                rawSourceUpdatedAt: new Date().toISOString(),
              });
              if (inserted?.id) {
                await repository.saveSourcePayload({ foodId: inserted.id, source: "usda", sourceId: food.sourceId, rawPayload: food.rawPayload }).catch(() => {});
                await repository.bindTags(inserted.id, normalized.auto_tags, "rule").catch(() => {});
              }
              success += 1;
            } catch {
              failed += 1;
            }
          }
          if (result.foods.length < pageSize) break;
          page += 1;
        }
        if (job) await repository.finishSyncJob(job.id, { status: failed ? "partial" : "succeeded", totalCount: total, successCount: success, failedCount: failed, resultSummary: { skipped, dryRun } });
        return { dryRun, query: q, total, success, failed, skipped };
      } catch (err) {
        if (job) await repository.finishSyncJob(job.id, { status: "failed", totalCount: total, successCount: success, failedCount: failed, errorMessage: String(err?.message || err) });
        throw err instanceof FoodAdminError ? err : new FoodAdminError("USDA_IMPORT_FAILED");
      }
    },

    async syncImages(userId, foodId) {
      await requireAdmin(userId);
      const food = await repository.getFoodById(foodId);
      if (!food) throw new FoodAdminError("FOOD_NOT_FOUND");
      if (!imageService) throw new FoodAdminError("IMAGE_SERVICE_UNAVAILABLE");
      // Priority order documented in the spec.
      const tasks = [
        { sourcePriority: "manual", status: "pending" },
        { sourcePriority: "open_food_facts", status: "pending" },
        { sourcePriority: "user_upload", status: "pending" },
        { sourcePriority: "ai_generated", status: "pending" },
        { sourcePriority: "category_placeholder", status: "pending" },
      ];
      for (const t of tasks) {
        await repository.createImageTask(foodId, food.imageEntityKey ?? food.sourceId, t.sourcePriority).catch(() => {});
      }
      return { foodId, queued: tasks.length };
    },

    async listMissingImages(userId, limit = 50) {
      await requireAdmin(userId);
      return repository.listMissingImages(limit);
    },

    async listSyncJobs(userId, limit = 20) {
      await requireAdmin(userId);
      return repository.listSyncJobs(limit);
    },

    async reviewImage(userId, imageId, { status, isVerified, isPrimary, foodId } = {}) {
      await requireAdmin(userId);
      if (!["pending","processing","ready","failed","rejected"].includes(status)) throw new FoodAdminError("FOOD_IMAGE_STATUS_INVALID");
      await repository.reviewImage(imageId, { status, isVerified, isPrimary, foodId });
      return { imageId, status };
    },

    async updateFood(userId, foodId, patch) {
      await requireAdmin(userId);
      await repository.updateFood(foodId, patch);
      return { foodId };
    },

    async setPrimaryImage(userId, foodId, imageId) {
      await requireAdmin(userId);
      await repository.setPrimaryImage(foodId, imageId);
      return { foodId, imageId };
    },
  };
}

module.exports = { FoodAdminError, createFoodAdminService };
