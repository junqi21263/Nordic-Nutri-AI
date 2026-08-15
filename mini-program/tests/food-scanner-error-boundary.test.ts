import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "src/pages/food-scanner/index.tsx"), "utf8");

describe("food scanner error boundary", () => {
  it("does not classify a result-page navigation failure as a vision failure", () => {
    const analysisStart = source.indexOf("await analyzeProductImage(previewPath,");
    const analysisCatch = source.indexOf("} catch (error)", analysisStart);
    const navigate = source.indexOf('await Taro.navigateTo({ url: "/pages/analysis-result/index?reveal=1" });');

    expect(analysisStart).toBeGreaterThanOrEqual(0);
    expect(analysisCatch).toBeGreaterThan(analysisStart);
    expect(navigate).toBeGreaterThan(analysisCatch);
  });
});
