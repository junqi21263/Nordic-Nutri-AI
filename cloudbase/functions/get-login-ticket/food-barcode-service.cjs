// food-barcode-service.cjs
// Barcode lookup with local-first cache and idempotent remote enrichment.
// Order: local foods by barcode -> Open Food Facts -> normalize -> upsert ->
// persist raw payload -> (optional) image sync. A per-barcode in-memory lock
// prevents concurrent duplicate creation within a single function instance.

const { OpenFoodFactsError } = require("./open-food-facts-service.cjs");
const { FoodRepositoryError } = require("./food-repository.cjs");

class FoodBarcodeError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function createFoodBarcodeService({ repository, openFoodFacts, normalizer, imageService, imageSyncEnabled = true }) {
  const locks = new Map();

  async function acquireLock(barcode) {
    const key = String(barcode);
    while (locks.has(key)) {
      await locks.get(key);
    }
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    locks.set(key, promise);
    return () => { locks.delete(key); release(); };
  }

  return {
    async lookup(barcode, { syncImage = imageSyncEnabled } = {}) {
      const code = String(barcode ?? "").trim();
      if (!/^\d{6,14}$/.test(code)) throw new FoodBarcodeError("FOOD_BARCODE_INVALID");

      // Fast path: local cache hit.
      const cached = await repository.getFoodByBarcode(code);
      if (cached) {
        // Fire-and-forget popularity bump; must not block the response.
        repository.incrementPopularity(cached.id).catch(() => {});
        return { food: cached, source: "cache" };
      }

      // Idempotent remote enrichment under a per-barcode lock.
      const release = await acquireLock(code);
      try {
        // Re-check after acquiring the lock (another request may have created it).
        const rechecked = await repository.getFoodByBarcode(code);
        if (rechecked) return { food: rechecked, source: "cache" };

        let product;
        try {
          product = await openFoodFacts.getByBarcode(code);
        } catch (err) {
          if (err instanceof OpenFoodFactsError && /OFF_HTTP_404|OFF_BARCODE_INVALID/.test(err.code)) {
            throw new FoodBarcodeError("FOOD_BARCODE_NOT_FOUND");
          }
          throw new FoodBarcodeError("FOOD_BARCODE_SOURCE_UNAVAILABLE");
        }
        if (!product) throw new FoodBarcodeError("FOOD_BARCODE_NOT_FOUND");

        const normalized = normalizer.normalizeFoodRecord({
          name_en: product.name_en,
          name_zh: product.name_zh,
          brand_name: product.brandName,
          description: product.description,
          calories: product.calories,
          protein_g: product.protein_g,
          carbs_g: product.carbs_g,
          fat_g: product.fat_g,
          fiber_g: product.fiber_g,
          sugar_g: product.sugar_g,
          sodium_mg: product.sodium_mg,
        }, { categoryCode: null });

        const inserted = await repository.upsertFood({
          source: "open_food_facts",
          sourceId: code,
          barcode: code,
          nameZh: normalized.name_zh,
          nameEn: normalized.name_en,
          normalizedName: normalized.normalized_name,
          brandName: normalized.brand_name,
          description: normalized.description,
          searchKeywords: normalized.search_keywords,
          calories: normalized.nutrition.calories,
          proteinG: normalized.nutrition.protein_g,
          carbsG: normalized.nutrition.carbs_g,
          fatG: normalized.nutrition.fat_g,
          fiberG: normalized.nutrition.fiber_g,
          sugarG: normalized.nutrition.sugar_g,
          sodiumMg: normalized.nutrition.sodium_mg,
          nutritionBasis: "per_100g",
          qualityScore: product.qualityScore ?? 50,
          isVerified: false,
        });

        // Persist the raw OFF payload (server-only; never returned to client).
        if (inserted?.id) {
          await repository.saveSourcePayload({
            foodId: inserted.id,
            source: "open_food_facts",
            sourceId: code,
            rawPayload: product.rawPayload,
            ttlSeconds: 86400,
          }).catch(() => {});
          await repository.bindTags(inserted.id, normalized.auto_tags, "rule").catch(() => {});

          // Optional image sync (best-effort, non-blocking for the response).
          if (syncImage && product.imageUrl && imageService) {
            imageService.acquireFromUrl(product.imageUrl, { imageEntityKey: code })
              .then(async (acquired) => {
                if (!acquired.detailUrl) return;
                const image = await repository.insertImage({
                  food_id: inserted.id,
                  image_entity_key: code,
                  image_type: "packaged",
                  source: "open_food_facts",
                  source_url: product.imageUrl,
                  storage_path: acquired.storagePath,
                  thumb_url: acquired.thumbUrl,
                  medium_url: acquired.mediumUrl,
                  detail_url: acquired.detailUrl,
                  mime_type: acquired.mimeType,
                  width: acquired.width,
                  height: acquired.height,
                  file_size: acquired.fileSize,
                  content_hash: acquired.contentHash,
                  license: product.license,
                  attribution: product.attribution,
                  is_primary: false,
                  is_verified: false,
                  status: "ready",
                }).catch(() => {});
                if (image) await repository.setPrimaryImage(inserted.id, image.id).catch(() => {});
              })
              .catch(() => {});
          }
        }

        return { food: inserted, source: "open_food_facts" };
      } finally {
        release();
      }
    },
  };
}

module.exports = { FoodBarcodeError, createFoodBarcodeService };
