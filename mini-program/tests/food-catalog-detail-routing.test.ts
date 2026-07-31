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

  it("preserves the selected category when returning from food detail", () => {
    expect(catalogPage).toMatch(/didBootstrapRef|hasBootstrappedRef|catalogBootstrappedRef/);
    const didShowBlock = catalogPage.match(/useDidShow\(\(\) => \{[\s\S]*?\n  \}\);/)?.[0] ?? "";
    expect(didShowBlock).toContain("loadTaxonomy");
    expect(didShowBlock).toMatch(/if \([^)]*(didBootstrap|hasBootstrapped|catalogBootstrapped)/);
    expect(didShowBlock).not.toMatch(/useDidShow\(\(\) => \{\s*void discover\(\);\s*void loadTaxonomy\(\);/);
  });

  it("shows a refresh control beside popular recommendations", () => {
    expect(catalogPage).toContain("food-catalog-section__header");
    expect(catalogPage).toContain("food-catalog-section__refresh");
    expect(catalogPage).toContain("refreshPopular");
    expect(catalogPage).toContain('name="refresh-cw"');
    expect(catalogPage).toContain("shuffleCatalogItems");
    expect(catalogPage).toContain("pickRandomCatalogPage");
  });
});
