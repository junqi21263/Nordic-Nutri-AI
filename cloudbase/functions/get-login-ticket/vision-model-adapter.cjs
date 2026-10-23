const {
  downloadHttpsBuffer,
  detectImageMime,
} = require("./hunyuan-image-service.cjs");
const { resolveVisionProfile } = require("./vision-model-profile.cjs");
const { createQwenVisionService } = require("./qwen-vision-service.cjs");
const {
  createRoutedOpenAiFetch,
} = require("./text-model-adapter-registry.cjs");

// Protocol adapters return the same validated food result; routing and quota
// ownership remain outside this factory.
function createVisionModelAdapter(
  route,
  { fetchImpl = globalThis.fetch, downloadImage = downloadHttpsBuffer } = {},
) {
  const profile = resolveVisionProfile(route);
  const analyze = createQwenVisionService({
    apiKey: route.credential,
    flashModel: route.modelKey,
    plusModel: route.modelKey,
    provider: route.providerKey,
    profile,
    maxTokens: route.maxTokens,
    temperature: route.temperature ?? 0,
    providerTimeoutMs: route.timeoutMs,
    fetchImpl: createRoutedOpenAiFetch(route, {
      fetchImpl,
      preserveVisionParameters: true,
    }),
  });
  return async (input) => {
    if (
      profile.imageInput !== "inline" ||
      /^data:image\//i.test(String(input.imageDataUrl || input.imageUrl || ""))
    )
      return analyze(input);
    const timeoutMs = Math.min(
      5000,
      input.budget?.remainingAfterReserve?.(5500) ?? 5000,
    );
    if (timeoutMs <= 0)
      throw Object.assign(new Error("VISION_TIMEOUT"), {
        code: "VISION_TIMEOUT",
      });
    const start = Date.now();
    const downloaded = await downloadImage(input.imageUrl, {
      maxBytes: 4 * 1024 * 1024,
      timeoutMs,
    });
    const mime = detectImageMime(downloaded.buffer, downloaded.contentType);
    if (
      !mime ||
      !downloaded.buffer?.length ||
      downloaded.buffer.length > 4 * 1024 * 1024
    )
      throw Object.assign(new Error("VISION_MEDIA_UNSUPPORTED"), {
        code: "VISION_MEDIA_UNSUPPORTED",
      });
    input.observe?.({
      stage: "image_prepare",
      ms: Date.now() - start,
      status: "succeeded",
      provider: route.providerKey,
      model: route.modelKey,
    });
    return analyze({
      ...input,
      imageDataUrl: `data:${mime};base64,${downloaded.buffer.toString("base64")}`,
    });
  };
}
module.exports = { createVisionModelAdapter };
