/** Reject picks larger than this before compress/upload. */
export const MAX_PICK_IMAGE_BYTES = 8 * 1024 * 1024;

/** Soft target after compression for vision / coach upload. */
export const MAX_UPLOAD_IMAGE_BYTES = 1.5 * 1024 * 1024;

export const MAX_PICK_IMAGE_MB = MAX_PICK_IMAGE_BYTES / (1024 * 1024);

export function formatImageTooLargeMessage(limitMb = MAX_PICK_IMAGE_MB) {
  return `图片过大（超过 ${limitMb}MB），请换一张更小的照片或先压缩后再试`;
}

/** Throws when the chosen file exceeds the pick limit. */
export function assertImageWithinPickLimit(sizeBytes: number | undefined | null) {
  if (typeof sizeBytes === "number" && sizeBytes > MAX_PICK_IMAGE_BYTES) {
    throw new Error(formatImageTooLargeMessage());
  }
}
