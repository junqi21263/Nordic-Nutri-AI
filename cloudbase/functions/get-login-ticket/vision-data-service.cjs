const crypto = require("node:crypto");
const { compressVisionImageForStorage } = require("./vision-image-compress.cjs");
const { VISION_BUDGETS } = require("./vision-budget.cjs");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const acceptedContentTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/bmp", "image/heic",
]);

/** Hard ceiling after client compress; pick limit on device remains higher. */
const MAX_DECODED_IMAGE_BYTES = 4 * 1024 * 1024;
const NUTRITION_MAX_TIMEOUT_MS = VISION_BUDGETS.nutritionReserveMs;
const EVALUATION_MAX_TIMEOUT_MS = VISION_BUDGETS.evaluationMaxMs;
const PERSISTENCE_RESERVE_MS = VISION_BUDGETS.persistenceReserveMs;
const SECURITY_MAX_TIMEOUT_MS = VISION_BUDGETS.securityMaxMs;
const REQUIRED_NUTRITION_FIELDS = ["quantityG", "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"];
const timeoutSentinel = Symbol("vision-timeout");

class PublicVisionDataError extends Error {
  constructor(code, message = "图片识别请求无效") {
    super(message);
    this.code = code;
  }
}

function readImage(input) {
  if (typeof input?.clientRequestId !== "string" || !uuidPattern.test(input.clientRequestId)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  if (!acceptedContentTypes.has(input.contentType)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  if (typeof input.storedImageUrl === "string" && /^https:\/\//i.test(input.storedImageUrl) && typeof input.imagePath === "string" && input.imagePath) {
    return { content: null, contentType: input.contentType, clientRequestId: input.clientRequestId, stored: true };
  }
  if (typeof input.imageBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  const content = Buffer.from(input.imageBase64, "base64");
  if (content.length < 4 || content.length > MAX_DECODED_IMAGE_BYTES) {
    throw new PublicVisionDataError("VISION_IMAGE_INVALID", "图片过大，请压缩后重试");
  }
  return { content, contentType: input.contentType, clientRequestId: input.clientRequestId };
}

function fallbackEvaluation(result) {
  if (result.confidence >= 0.85) return "这餐吃得不错";
  if (result.confidence >= 0.7) return "整体还算均衡";
  if (result.items?.length >= 4) return "食材比较丰富";
  return "建议核对份量";
}

function withTimeout(promise, ms, fallbackValue) {
  if (!(Number(ms) > 0)) return Promise.resolve(fallbackValue);
  let timer;
  return Promise.race([
    promise,
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallbackValue), ms); }),
  ]).finally(() => clearTimeout(timer));
}

function isSaveableNutrition(items) {
  return Array.isArray(items) && items.length > 0 && items.every((item) =>
    typeof item?.name === "string" && item.name.trim() &&
    Number.isFinite(item.quantityG) && item.quantityG > 0 &&
    REQUIRED_NUTRITION_FIELDS.filter((field) => field !== "quantityG").every((field) => Number.isFinite(item[field]) && item[field] >= 0));
}

function summarizeItems(items) {
  return (Array.isArray(items) ? items : []).slice(0, 20).map((item) => ({
    name: item?.name ?? null,
    quantityG: item?.quantityG ?? null,
    caloriesPer100g: item?.caloriesPer100g ?? null,
    proteinPer100g: item?.proteinPer100g ?? null,
    carbsPer100g: item?.carbsPer100g ?? null,
    fatPer100g: item?.fatPer100g ?? null,
  }));
}

function summarizeRecognition(result) {
  return {
    mealName: result?.mealName ?? null,
    foodName: result?.mealName ?? null,
    mealType: result?.mealType ?? null,
    confidence: result?.confidence ?? null,
    portionConfidence: result?.portionConfidence ?? null,
    items: summarizeItems(result?.items),
  };
}

function createVisionDataService({
  db,
  uploadImage,
  analyze,
  provider = "vita",
  model = "vita-video-3.0",
  evaluateMeal,
  backfillNutrition,
  assertImageSafe,
  uploadBlockedImage,
  recordTrace,
} = {}) {
  if (!db || typeof db.from !== "function" || typeof uploadImage !== "function") throw new Error("Vision dependencies are unavailable");
  const emitTrace = (meta) => {
    if (typeof recordTrace !== "function") return;
    Promise.resolve()
      .then(() => recordTrace("vision_recognition_trace", 1, meta))
      .catch((error) => console.warn("[vision] trace recording failed:", error?.message || error));
  };
  return {
    provider,
    model: model || "vita-video-3.0",
    validateImage(input) {
      return readImage(input);
    },
    async analyzeImage(userId, input, { budget, observe = () => {}, onAssetReady, onProviderSuccess } = {}) {
      if (typeof analyze !== "function") throw new PublicVisionDataError("VISION_SERVICE_NOT_CONFIGURED", "图片识别服务未配置");
      const image = readImage(input);
      if (typeof assertImageSafe === "function" && image.content) {
        const securityStartedAt = Date.now();
        try {
          const securityTimeoutMs = budget?.stageTimeout
            ? budget.stageTimeout(SECURITY_MAX_TIMEOUT_MS, 0)
            : SECURITY_MAX_TIMEOUT_MS;
          const safeResult = await withTimeout(
            assertImageSafe({ buffer: image.content, contentType: image.contentType, timeoutMs: securityTimeoutMs, budget }),
            securityTimeoutMs,
            timeoutSentinel,
          );
          if (safeResult === timeoutSentinel) throw new PublicVisionDataError("VISION_TIMEOUT", "图片安全检查超时，请重试");
          observe({ stage: "safety_check", ms: Date.now() - securityStartedAt, safetyCheckSuccess: true });
        } catch (securityError) {
          observe({ stage: "safety_check", ms: Date.now() - securityStartedAt, safetyCheckSuccess: false, abortReason: securityError?.code === "VISION_TIMEOUT" ? "timeout" : null });
          if (securityError?.code === "VISION_CONTENT_BLOCKED" && typeof uploadBlockedImage === "function") {
            try {
              const blockedMedia = await compressVisionImageForStorage(image.content, image.contentType, {
                maxEdge: 1280,
                quality: 72,
              });
              const blocked = await uploadBlockedImage({
                userId,
                content: blockedMedia.buffer,
                contentType: blockedMedia.contentType,
              });
              if (blocked?.cloudPath) securityError.imagePath = blocked.cloudPath;
            } catch (uploadErr) {
              console.warn("[vision] blocked quarantine upload failed:", uploadErr?.message || uploadErr);
            }
          }
          throw securityError;
        }
      }
      const stored = image.stored ? { buffer: null, contentType: image.contentType } : await compressVisionImageForStorage(image.content, image.contentType);
      const storeContent = stored.buffer;
      const storeContentType = stored.contentType || "image/jpeg";
      const sha256 = image.stored && /^[0-9a-f]{64}$/i.test(String(input.imageSha256 || ""))
        ? String(input.imageSha256).toLowerCase()
        : crypto.createHash("sha256").update(storeContent).digest("hex");
      const cloudPath = image.stored ? input.imagePath : `food-images/${userId}/${crypto.randomUUID()}.${storeContentType === "image/png" ? "png" : storeContentType === "image/webp" ? "webp" : "jpg"}`;
      const uploaded = image.stored
        ? { cloudPath, imageUrl: input.storedImageUrl }
        : await (async () => {
          const uploadStartedAt = Date.now();
          const result = await uploadImage({ cloudPath, content: storeContent, contentType: storeContentType, budget, observe });
          observe({ stage: "upload", ms: Date.now() - uploadStartedAt, uploadSuccess: true });
          return result;
        })();
      if (typeof uploaded?.imageUrl !== "string" || !uploaded.imageUrl) throw new Error("Vision image upload failed");
      let assetPersisted = image.stored && input.storedAsset === true;
      if (typeof onAssetReady === "function") {
        const assetReady = await onAssetReady({
          analysisId: input.analysisId || null,
          userId,
          cloudPath: uploaded.cloudPath,
          contentType: storeContentType,
          byteSize: image.stored ? Number(input.storedByteSize || 0) : storeContent.length,
          imageSha256: sha256,
        });
        assetPersisted = assetReady?.assetId != null || assetReady === true;
      }
      let modelTrace = null;
      const result = input.providerCheckpoint && typeof input.providerCheckpoint === "object"
        ? input.providerCheckpoint
        : await analyze({
          imageUrl: uploaded.imageUrl,
          budget,
          observe,
          onTrace: (trace) => { modelTrace = trace; },
        });
      let providerCheckpointed = false;
      if (typeof onProviderSuccess === "function") {
        await onProviderSuccess({
          analysisId: input.analysisId || null,
          userId,
          providerResult: result,
          imagePath: uploaded.cloudPath,
          imageSha256: sha256,
          providerAttempt: Number(input.providerAttempt || 1),
        });
        providerCheckpointed = true;
      }
      const downstreamReserveMs = NUTRITION_MAX_TIMEOUT_MS + EVALUATION_MAX_TIMEOUT_MS + PERSISTENCE_RESERVE_MS;
      if (providerCheckpointed && budget?.remainingMs && budget.remainingMs() <= downstreamReserveMs) {
        observe({ stage: "provider_checkpoint", ms: 0, status: "succeeded", resumeStage: "enriching" });
        return {
          kind: "checkpoint",
          analysisId: input.analysisId || null,
          providerResult: result,
          providerAttempt: Number(input.providerAttempt || 1),
          resumeStage: "enriching",
        };
      }

      // Backfill per-100g nutrition from USDA food catalog. Flash nutrition remains usable
      // when it already satisfies the save contract; otherwise backfill is required.
      let backfilledItems = result.items;
      let nutritionSource = "ai_estimate";
      const nutritionMode = isSaveableNutrition(result.items) ? "enrichment" : "required";
      const beforeBackfillItems = summarizeItems(result.items);
      const backfillAttempted = typeof backfillNutrition === "function";
      let nutritionFallbackUsed = false;
      const buildTrace = ({ analysisId, imagePath, persistence }) => ({
        clientRequestId: image.clientRequestId,
        analysisId,
        imageSha256: sha256,
        imagePath,
        flash: modelTrace?.flash || { valid: true, ...summarizeRecognition(result) },
        plus: modelTrace?.plus || { attempted: false, success: false, valid: null, skipReason: "not_recorded", items: [] },
        selectedSource: modelTrace?.selectedSource || "flash",
        selected: modelTrace?.selected || summarizeRecognition(result),
        nutrition: {
          mode: nutritionMode,
          backfillAttempted,
          backfillMatched: backfilledItems.filter((item) => item?.nutritionSource === "usda").length,
          nutritionSource,
          beforeItems: beforeBackfillItems,
          afterItems: summarizeItems(backfilledItems),
          fallbackUsed: nutritionFallbackUsed,
        },
        persistence,
      });
      if (typeof backfillNutrition === "function") {
        const nutritionStartedAt = Date.now();
        const nutritionTimeoutMs = budget?.stageTimeout
          ? budget.stageTimeout(NUTRITION_MAX_TIMEOUT_MS, EVALUATION_MAX_TIMEOUT_MS + PERSISTENCE_RESERVE_MS)
          : 8_000;
        try {
          backfilledItems = await withTimeout(
            backfillNutrition(result.items),
            nutritionTimeoutMs,
            timeoutSentinel,
          );
          if (backfilledItems === timeoutSentinel) throw new PublicVisionDataError("VISION_TIMEOUT", "营养信息处理超时，请重试");
          const usdaCount = backfilledItems.filter((item) => item.nutritionSource === "usda").length;
          if (usdaCount > 0) nutritionSource = usdaCount === backfilledItems.length ? "usda" : "mixed";
        } catch (backfillErr) {
          console.error("[vision] nutrition backfill failed:", backfillErr?.message || backfillErr);
          if (nutritionMode === "required") {
            throw new PublicVisionDataError("VISION_NUTRITION_FAILED", "营养信息处理失败，请重试");
          }
          nutritionFallbackUsed = true;
          backfilledItems = result.items.map((item) => ({ ...item, nutritionSource: "ai_estimate" }));
        }
        observe({ stage: "nutrition", ms: Date.now() - nutritionStartedAt, nutritionBlocking: nutritionMode === "required", nutritionFallbackUsed });
      } else if (nutritionMode === "required") {
        throw new PublicVisionDataError("VISION_NUTRITION_FAILED", "营养信息处理失败，请重试");
      }

      // Evaluation and persistence remain synchronous in V1; both are bounded by the same deadline.
      const evaluationStartedAt = Date.now();
      const evaluationPromise = typeof evaluateMeal === "function"
        ? withTimeout(
          evaluateMeal({
            userId,
            mealName: result.mealName,
            mealType: result.mealType,
            items: backfilledItems,
            confidence: result.confidence,
          }).then((value) => {
            if (typeof value === "string") return value;
            if (value && typeof value === "object" && typeof value.evaluation === "string") return value.evaluation;
            return null;
          }).catch((evalErr) => {
            console.error("[vision] evaluation failed (non-blocking):", evalErr?.message || evalErr);
            return null;
          }),
          budget?.stageTimeout ? budget.stageTimeout(EVALUATION_MAX_TIMEOUT_MS, PERSISTENCE_RESERVE_MS) : EVALUATION_MAX_TIMEOUT_MS,
          null,
        )
        : Promise.resolve(null);
      evaluationPromise.then(() => observe({ stage: "evaluation", ms: Date.now() - evaluationStartedAt, evaluationSuccess: true })).catch(() => {});

      const persistenceStartedAt = Date.now();
      const persistenceState = { analysisId: null, errorCode: null };
      const persistPromise = (async () => {
        if (budget?.remainingMs && budget.remainingMs() <= 0) {
          throw new PublicVisionDataError("VISION_TIMEOUT", "识别时间有点久，请重新试一次");
        }
        // Only persist resolvable CloudBase fileIDs (cloud://...). Relative keys without a real upload
        // produce admin "暂无预览" forever.
        const durablePath = typeof uploaded.cloudPath === "string" && uploaded.cloudPath.startsWith("cloud://")
          ? uploaded.cloudPath
          : null;
        let assetId = null;
        if (durablePath && !assetPersisted && storeContent) {
          try {
            const asset = await db.from("uploaded_assets").insert({
              user_id: userId,
              bucket_id: "cloudbase-storage",
              object_path: durablePath,
              content_type: storeContentType === "image/png" || storeContentType === "image/webp" ? storeContentType : "image/jpeg",
              byte_size: storeContent.length,
              sha256,
              status: "attached",
            }).select("id").single();
            assetId = asset.data?.id ?? null;
            if (!assetId) throw new Error("uploaded_assets insert returned no id");
          } catch (dbErr) {
            console.error("[vision] uploaded_assets insert failed:", dbErr?.message || dbErr);
            throw new PublicVisionDataError("VISION_PERSISTENCE_FAILED", "识别结果保存失败，请重试");
          }
        } else {
          console.warn("[vision] skipping uploaded_assets — no durable cloud fileID (upload used data-URL fallback)");
        }
        if (budget?.remainingMs && budget.remainingMs() <= 0) {
          throw new PublicVisionDataError("VISION_TIMEOUT", "识别时间有点久，请重新试一次");
        }
        let analysisId = input.analysisId || assetId;
        try {
          if (input.deferAnalysisPersistence === true) {
            persistenceState.analysisId = analysisId;
            return analysisId;
          }
          const analysisPayload = {
            user_id: userId,
            image_path: durablePath,
            image_sha256: sha256,
            provider: result.provider || provider,
            model: result.model || model,
            status: "completed",
            confidence: result.confidence,
            raw_recognition: result,
            normalized_items: backfilledItems,
            advice: result.advice || null,
            client_request_id: image.clientRequestId,
            completed_at: new Date().toISOString(),
          };
          const saved = input.analysisId
            ? await db.from("ai_analysis").update({ ...analysisPayload, status: "completed", current_stage: "persisting", completed_at: new Date().toISOString() }).eq("id", input.analysisId).eq("user_id", userId).select("id").single()
            : await db.from("ai_analysis").insert(analysisPayload).select("id").single();
          if (saved?.error) throw new Error(saved.error.message || "ai_analysis persistence failed");
          if (!saved?.data?.id) throw new Error("ai_analysis persistence returned no id");
          analysisId = saved.data.id;
          if (assetId) {
            const linked = await db.from("uploaded_assets").update({ analysis_id: analysisId }).eq("id", assetId);
            if (linked?.error) throw new Error(linked.error.message || "uploaded_assets linkage failed");
          }
          persistenceState.analysisId = analysisId;
        } catch (dbErr) {
          console.error("[vision] ai_analysis insert failed:", dbErr?.message || dbErr);
          if (dbErr instanceof PublicVisionDataError) throw dbErr;
          throw new PublicVisionDataError("VISION_PERSISTENCE_FAILED", "识别结果保存失败，请重试");
        }
        return analysisId;
      })();
      persistPromise.then(
        () => {
          observe({ stage: "persistence", ms: Date.now() - persistenceStartedAt, persistenceSuccess: true });
        },
        (error) => {
          persistenceState.errorCode = error?.code || "VISION_PERSISTENCE_FAILED";
          observe({ stage: "persistence", ms: Date.now() - persistenceStartedAt, persistenceSuccess: false, abortReason: error?.code === "VISION_TIMEOUT" ? "timeout" : null });
        },
      );

      try {
        const [evaluation, analysisId] = await Promise.all([evaluationPromise, persistPromise]);
        // Prefer HTTPS for immediate display; always return durable cloud file ID when storage worked.
        const clientImageUrl = /^https:\/\//i.test(uploaded.imageUrl) ? uploaded.imageUrl : null;
        const imagePath = typeof uploaded.cloudPath === "string" && uploaded.cloudPath.startsWith("cloud://")
          ? uploaded.cloudPath
          : null;
        emitTrace(buildTrace({
          analysisId,
          imagePath,
          persistence: { success: true, analysisId, errorCode: null },
        }));
        return {
          analysisId,
          evaluation: evaluation || fallbackEvaluation(result),
          imageUrl: clientImageUrl,
          imagePath,
          nutritionSource,
          ...result,
          items: backfilledItems,
        };
      } catch (error) {
        if (providerCheckpointed && error && typeof error === "object") error.resumeStage = "enriching";
        const imagePath = typeof uploaded.cloudPath === "string" && uploaded.cloudPath.startsWith("cloud://")
          ? uploaded.cloudPath
          : null;
        emitTrace(buildTrace({
          analysisId: persistenceState.analysisId,
          imagePath,
          persistence: {
            success: false,
            analysisId: persistenceState.analysisId,
            errorCode: persistenceState.errorCode || error?.code || "VISION_PERSISTENCE_FAILED",
          },
        }));
        throw error;
      }
    },
  };
}

module.exports = { createVisionDataService, PublicVisionDataError, MAX_DECODED_IMAGE_BYTES };
