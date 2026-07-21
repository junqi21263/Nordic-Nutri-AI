const crypto = require("node:crypto");

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class PublicVisionDataError extends Error {
  constructor(code, message = "图片识别请求无效") {
    super(message);
    this.code = code;
  }
}

function readImage(input) {
  if (typeof input?.clientRequestId !== "string" || !uuidPattern.test(input.clientRequestId)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  if (input.contentType !== "image/jpeg" && input.contentType !== "image/webp") throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  if (typeof input.imageBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.imageBase64)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  const content = Buffer.from(input.imageBase64, "base64");
  if (content.length < 4 || content.length > 3 * 1024 * 1024) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  const isJpeg = content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
  const isWebp = content.subarray(0, 4).toString("ascii") === "RIFF" && content.subarray(8, 12).toString("ascii") === "WEBP";
  if ((input.contentType === "image/jpeg" && !isJpeg) || (input.contentType === "image/webp" && !isWebp)) throw new PublicVisionDataError("VISION_IMAGE_INVALID");
  return { content, contentType: input.contentType, clientRequestId: input.clientRequestId };
}

function createVisionDataService({ db, uploadImage, analyze, model = "vita-video-3.0" }) {
  if (!db || typeof db.from !== "function" || typeof uploadImage !== "function") throw new Error("Vision dependencies are unavailable");
  return {
    async analyzeImage(userId, input) {
      if (typeof analyze !== "function") throw new PublicVisionDataError("VISION_SERVICE_NOT_CONFIGURED", "图片识别服务未配置");
      const image = readImage(input);
      const sha256 = crypto.createHash("sha256").update(image.content).digest("hex");
      const extension = image.contentType === "image/webp" ? "webp" : "jpg";
      const cloudPath = `food-images/${userId}/${crypto.randomUUID()}.${extension}`;
      const uploaded = await uploadImage({ cloudPath, content: image.content, contentType: image.contentType });
      if (typeof uploaded?.imageUrl !== "string" || !uploaded.imageUrl) throw new Error("Vision image upload failed");
      const asset = await db.from("uploaded_assets").insert({
        user_id: userId,
        bucket_id: "cloudbase-storage",
        object_path: uploaded.cloudPath ?? cloudPath,
        content_type: image.contentType,
        byte_size: image.content.length,
        sha256,
        status: "attached",
      }).select("id").single();
      if (asset.error || !asset.data?.id) throw new Error("Vision asset save failed");
      const result = await analyze({ imageUrl: uploaded.imageUrl });
      const saved = await db.from("ai_analysis").insert({
        user_id: userId,
        image_path: uploaded.cloudPath ?? cloudPath,
        image_sha256: sha256,
        provider: "vita",
        model,
        status: "succeeded",
        confidence: result.confidence,
        raw_recognition: result,
        normalized_items: result.items,
        advice: result.advice || null,
        client_request_id: image.clientRequestId,
      }).select("id").single();
      if (saved.error || !saved.data?.id) throw new Error("Vision analysis save failed");
      return { analysisId: saved.data.id, ...result };
    },
  };
}

module.exports = { createVisionDataService, PublicVisionDataError };
