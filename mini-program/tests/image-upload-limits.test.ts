import { describe, expect, it } from "vitest";
import {
  assertImageWithinPickLimit,
  formatImageTooLargeMessage,
  MAX_PICK_IMAGE_BYTES,
  MAX_PICK_IMAGE_MB,
} from "../src/features/media/image-upload-limits";

describe("image upload limits", () => {
  it("allows images within the pick limit and rejects oversized ones", () => {
    expect(() => assertImageWithinPickLimit(undefined)).not.toThrow();
    expect(() => assertImageWithinPickLimit(MAX_PICK_IMAGE_BYTES)).not.toThrow();
    expect(() => assertImageWithinPickLimit(MAX_PICK_IMAGE_BYTES + 1)).toThrow(
      formatImageTooLargeMessage(MAX_PICK_IMAGE_MB),
    );
  });
});
