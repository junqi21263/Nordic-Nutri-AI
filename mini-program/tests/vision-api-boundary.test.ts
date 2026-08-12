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
    expect(api).toContain("compressedWidth");
    expect(api).toContain("VISION_CONTENT_BLOCKED");
    expect(api).toContain("图片未通过安全审核");
    expect(scanner).toContain("analyzeProductImage");
    expect(scanner).toContain("VISION_CONTENT_BLOCKED");
    expect(scanner).toContain("formatVisionUploadHint");
    expect(scanner).toContain('sizeType: ["compressed"]');
    expect(scanner).toContain('mode="aspectFit"');
    expect(scanner).not.toContain("assertImageWithinPickLimit");
    expect(scanner).not.toContain("captureRandom");
  });
});
