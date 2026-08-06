/** Reject picks larger than this before compress/upload. */
export const MAX_PICK_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Soft target after client compression for vision / coach upload.
 * Phone camera originals stay selectable up to MAX_PICK_IMAGE_BYTES.
 */
export const MAX_UPLOAD_IMAGE_BYTES = 2 * 1024 * 1024;

/** Hard reject after compress if still above this (matches server ceiling). */
export const MAX_UPLOAD_HARD_BYTES = 4 * 1024 * 1024;

export const MAX_PICK_IMAGE_MB = MAX_PICK_IMAGE_BYTES / (1024 * 1024);

/**
 * Formats the album/camera picker can typically provide.
 * HEIC is accepted by the server if it arrives, but WeChat album often greys it out.
 */
export const VISION_SUPPORTED_FORMATS_LABEL = "JPG、PNG、WebP、BMP";

export function formatVisionUploadHint() {
  return `支持 ${VISION_SUPPORTED_FORMATS_LABEL}，单张不超过 ${MAX_PICK_IMAGE_MB}MB`;
}

export function formatImageTooLargeMessage(limitMb = MAX_PICK_IMAGE_MB) {
  return `图片过大（超过 ${limitMb}MB），请换一张更小的照片或先压缩后再试`;
}

/** Throws when the chosen file exceeds the pick limit. */
export function assertImageWithinPickLimit(sizeBytes: number | undefined | null) {
  if (typeof sizeBytes === "number" && sizeBytes > MAX_PICK_IMAGE_BYTES) {
    throw new Error(formatImageTooLargeMessage());
  }
}

/** Throws when the compressed upload payload is still too large. */
export function assertImageWithinUploadHardLimit(sizeBytes: number | undefined | null) {
  if (typeof sizeBytes === "number" && sizeBytes > MAX_UPLOAD_HARD_BYTES) {
    throw new Error(formatImageTooLargeMessage(MAX_UPLOAD_HARD_BYTES / (1024 * 1024)));
  }
}
