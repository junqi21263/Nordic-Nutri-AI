import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const catalogPage = readFileSync(
  resolve(import.meta.dirname, "../src/pages/food-catalog/index.tsx"),
  "utf8",
);

describe("food catalog detail routing", () => {
  it("routes both the food card and the plus action through the food detail page", () => {
    expect(catalogPage).toContain('onClick={() => inspect(food)}');
    const plusIndex = catalogPage.indexOf('className="food-catalog-popular-card__add"');
    const plusBlock = catalogPage.slice(plusIndex, plusIndex + 520);
    expect(plusBlock).toContain('onClick={() => inspect(food)}');
    expect(plusBlock).not.toContain("quickAdd");
    expect(catalogPage).not.toContain("const quickAdd");
    expect(catalogPage).not.toContain("已选中，前往手动记录");
  });
});
