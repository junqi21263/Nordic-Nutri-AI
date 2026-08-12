import { describe, expect, it } from "vitest";
import {
  formatVisionUploadHint,
  MAX_UPLOAD_IMAGE_BYTES,
  VISION_SUPPORTED_FORMATS_LABEL,
} from "../src/features/media/image-upload-limits";

describe("image upload limits", () => {
  it("tells users that camera photos are optimized after selection", () => {
    const hint = formatVisionUploadHint();
    expect(hint).toContain(VISION_SUPPORTED_FORMATS_LABEL);
    expect(hint).toContain("自动优化");
    expect(hint).not.toContain("8MB");
  });

  it("keeps the client payload below the WeChat image-security fallback ceiling", () => {
    expect(MAX_UPLOAD_IMAGE_BYTES).toBeLessThan(900 * 1024);
  });
});
