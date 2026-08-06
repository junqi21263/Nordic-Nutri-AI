import { describe, expect, it } from "vitest";
import {
  assertImageWithinPickLimit,
  formatImageTooLargeMessage,
  formatVisionUploadHint,
  MAX_PICK_IMAGE_BYTES,
  MAX_PICK_IMAGE_MB,
  VISION_SUPPORTED_FORMATS_LABEL,
} from "../src/features/media/image-upload-limits";

describe("image upload limits", () => {
  it("allows images within the pick limit and rejects oversized ones", () => {
    expect(() => assertImageWithinPickLimit(undefined)).not.toThrow();
    expect(() => assertImageWithinPickLimit(MAX_PICK_IMAGE_BYTES)).not.toThrow();
    expect(() => assertImageWithinPickLimit(MAX_PICK_IMAGE_BYTES + 1)).toThrow(
      formatImageTooLargeMessage(MAX_PICK_IMAGE_MB),
    );
  });

  it("describes supported formats and pick size for the scanner page", () => {
    const hint = formatVisionUploadHint();
    expect(hint).toContain(VISION_SUPPORTED_FORMATS_LABEL);
    expect(hint).toContain(`${MAX_PICK_IMAGE_MB}MB`);
    expect(hint).not.toContain("自动压缩");
  });
});
