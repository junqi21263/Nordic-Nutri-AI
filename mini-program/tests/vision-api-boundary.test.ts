import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("real visual analysis boundary", () => {
  it("uploads the selected image to the authenticated vision endpoint", () => {
    const api = read("src/api/vision-api.ts");
    const scanner = read("src/pages/food-scanner/index.tsx");
    const server = read("../cloudbase/functions/get-login-ticket/index.js");
    expect(api).toContain("analyzeProductImage");
    expect(api).toContain("/vision-analysis");
    expect(api).toContain("imageBase64");
    expect(api).toContain("detectImageContentType");
    expect(api).toContain("contentType,");
    expect(api).toContain("source,");
    expect(api).toContain("originalContentType");
    expect(api).toContain("finalWidth");
    expect(server).toContain("requestTotalDurationMs");
    expect(server).toContain("temp_url_generation");
    expect(api).toContain("compressedWidth");
    expect(api).toContain("VISION_CONTENT_BLOCKED");
    expect(api).toContain("图片未通过安全审核");
    expect(api).toContain("CLIENT_TOTAL_BUDGET_MS");
    expect(api).toContain("remainingClientMs");
    expect(api).toContain("supportsAsyncVision");
    expect(api).toContain("resumeVisionAnalysis");
    expect(api).toContain("readPendingVisionAnalysisId");
    expect(scanner).toContain("mediaAcquisitionMs");
    expect(scanner).toContain("clientDeadlineAt");
    expect(scanner).toContain("VISION_CLIENT_TOTAL_BUDGET_MS");
    expect(scanner).not.toContain("const visionClientBudgetMs = 15_000");
    expect(scanner).toContain("analyzeProductImage");
    expect(scanner).toContain('source: "camera" | "album"');
    expect(scanner).toContain("mediaAcquisitionMs, source");
    expect(scanner).toContain("VISION_CONTENT_BLOCKED");
    expect(scanner).toContain("formatVisionUploadHint");
    expect(scanner).toContain('sizeType: ["compressed"]');
    expect(scanner).toContain('mode="aspectFit"');
    expect(scanner).not.toContain("assertImageWithinPickLimit");
    expect(scanner).not.toContain("captureRandom");
  });
});
