/**
 * Client target for vision / coach uploads. It stays below the 900KB fallback
 * ceiling of WeChat image security when the server-side image processor is unavailable.
 */
export const MAX_UPLOAD_IMAGE_BYTES = 800 * 1024;

/** Hard reject after compress if still above this (matches server ceiling). */
export const MAX_UPLOAD_HARD_BYTES = 4 * 1024 * 1024;

/**
 * Formats the album/camera picker can typically provide.
 * HEIC is accepted by the server if it arrives, but WeChat album often greys it out.
 */
export const VISION_SUPPORTED_FORMATS_LABEL = "JPG、PNG、WebP、BMP";

export function formatVisionUploadHint() {
  return `支持 ${VISION_SUPPORTED_FORMATS_LABEL}，相机照片会自动优化后上传`;
}

export function formatImageTooLargeMessage(limitMb = MAX_UPLOAD_HARD_BYTES / (1024 * 1024)) {
  return `图片过大（超过 ${limitMb}MB），请换一张更小的照片或先压缩后再试`;
}

/** Throws when the compressed upload payload is still too large. */
export function assertImageWithinUploadHardLimit(sizeBytes: number | undefined | null) {
  if (typeof sizeBytes === "number" && sizeBytes > MAX_UPLOAD_HARD_BYTES) {
    throw new Error(formatImageTooLargeMessage(MAX_UPLOAD_HARD_BYTES / (1024 * 1024)));
  }
}
