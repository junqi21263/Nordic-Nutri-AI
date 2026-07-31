import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("real visual analysis boundary", () => {
  it("uploads the selected image to the authenticated vision endpoint", () => {
    const api = read("src/api/vision-api.ts");
    const scanner = read("src/pages/food-scanner/index.tsx");
    expect(api).toContain("analyzeProductImage");
    expect(api).toContain("/vision-analysis");
    expect(api).toContain("imageBase64");
    expect(api).toContain("detectImageContentType");
    expect(api).toContain("contentType,");
    expect(api).toContain("MAX_PICK_IMAGE_BYTES");
    expect(api).toContain("formatImageTooLargeMessage");
    expect(scanner).toContain("analyzeProductImage");
    expect(scanner).toContain("assertImageWithinPickLimit");
    expect(scanner).toContain('sizeType: ["compressed"]');
    expect(scanner).not.toContain("captureRandom");
  });
});

