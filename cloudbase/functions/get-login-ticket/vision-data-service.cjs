const crypto = require("node:crypto");
const { compressVisionImageForStorage } = require("./vision-image-compress.cjs");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const acceptedContentTypes = new Set([
  "image/jpeg", "image/png", "image/webp", "image/bmp", "image/heic",
]);

/** Hard ceiling after client compress; pick limit on device remains higher. */
const MAX_DECODED_IMAGE_BYTES = 4 * 1024 * 1024;

class PublicVisionDataError extends Error {
  constructor(code, message = "图片识别请求无效") {
    super(message);
    this.code = code;
  }
}

function readImage(input) {
  if (typeof input?.clientRequestId !== "string" || !uuidPattern.test(input.clientRequestId)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  if (!acceptedContentTypes.has(input.contentType)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
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
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
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
} = {}) {
  if (!db || typeof db.from !== "function" || typeof uploadImage !== "function") throw new Error("Vision dependencies are unavailable");
  return {
    provider,
    model: model || "vita-video-3.0",
    async analyzeImage(userId, input) {
      if (typeof analyze !== "function") throw new PublicVisionDataError("VISION_SERVICE_NOT_CONFIGURED", "图片识别服务未配置");
      const image = readImage(input);
      if (typeof assertImageSafe === "function") {
        try {
          await assertImageSafe({ buffer: image.content, contentType: image.contentType });
        } catch (securityError) {
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
      const stored = await compressVisionImageForStorage(image.content, image.contentType);
      const storeContent = stored.buffer;
      const storeContentType = stored.contentType || "image/jpeg";
      const sha256 = crypto.createHash("sha256").update(storeContent).digest("hex");
      const extension = storeContentType === "image/png" ? "png" : storeContentType === "image/webp" ? "webp" : "jpg";
      const cloudPath = `food-images/${userId}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await uploadImage({ cloudPath, content: storeContent, contentType: storeContentType });
      if (typeof uploaded?.imageUrl !== "string" || !uploaded.imageUrl) throw new Error("Vision image upload failed");
      const result = await analyze({ imageUrl: uploaded.imageUrl });

      // Backfill per-100g nutrition from USDA food catalog (non-blocking, falls back to AI estimates).
      let backfilledItems = result.items;
      let nutritionSource = "ai_estimate";
      if (typeof backfillNutrition === "function") {
        try {
          backfilledItems = await withTimeout(
            backfillNutrition(result.items),
            8_000,
            result.items.map((item) => ({ ...item, nutritionSource: "ai_estimate" })),
          );
          const usdaCount = backfilledItems.filter((item) => item.nutritionSource === "usda").length;
          if (usdaCount > 0) nutritionSource = usdaCount === backfilledItems.length ? "usda" : "mixed";
        } catch (backfillErr) {
          console.error("[vision] nutrition backfill failed (non-blocking):", backfillErr?.message || backfillErr);
          backfilledItems = result.items.map((item) => ({ ...item, nutritionSource: "ai_estimate" }));
        }
      }

      // Evaluation + audit writes run in parallel and must not block recognition success.
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
          2_500,
          null,
        )
        : Promise.resolve(null);

      const persistPromise = (async () => {
        // Only persist resolvable CloudBase fileIDs (cloud://...). Relative keys without a real upload
        // produce admin "暂无预览" forever.
        const durablePath = typeof uploaded.cloudPath === "string" && uploaded.cloudPath.startsWith("cloud://")
          ? uploaded.cloudPath
          : null;
        let assetId = null;
        if (durablePath) {
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
          } catch (dbErr) {
            console.error("[vision] uploaded_assets insert failed (non-blocking):", dbErr?.message || dbErr);
          }
        } else {
          console.warn("[vision] skipping uploaded_assets — no durable cloud fileID (upload used data-URL fallback)");
        }
        let analysisId = assetId || crypto.randomUUID();
        try {
          const saved = await db.from("ai_analysis").insert({
            user_id: userId,
            image_path: durablePath,
            image_sha256: sha256,
            provider: result.provider || provider,
            model: result.model || model,
            status: "succeeded",
            confidence: result.confidence,
            raw_recognition: result,
            normalized_items: backfilledItems,
            advice: result.advice || null,
            client_request_id: image.clientRequestId,
          }).select("id").single();
          if (saved.data?.id) analysisId = saved.data.id;
        } catch (dbErr) {
          console.error("[vision] ai_analysis insert failed (non-blocking):", dbErr?.message || dbErr);
        }
        return analysisId;
      })();

      const [evaluation, analysisId] = await Promise.all([evaluationPromise, persistPromise]);
      // Prefer HTTPS for immediate display; always return durable cloud file ID when storage worked.
      const clientImageUrl = /^https:\/\//i.test(uploaded.imageUrl) ? uploaded.imageUrl : null;
      const imagePath = typeof uploaded.cloudPath === "string" && uploaded.cloudPath.startsWith("cloud://")
        ? uploaded.cloudPath
        : null;
      return {
        analysisId,
        evaluation: evaluation || fallbackEvaluation(result),
        imageUrl: clientImageUrl,
        imagePath,
        nutritionSource,
        ...result,
        items: backfilledItems,
      };
    },
  };
}

module.exports = { createVisionDataService, PublicVisionDataError, MAX_DECODED_IMAGE_BYTES };
