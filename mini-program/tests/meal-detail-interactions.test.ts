import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("餐食详情交互", () => {
  it("为每个食材提供可用的详情跳转", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const config = read("app.config.ts");

    expect(detail).toContain("const openIngredient = (itemId: string) => {");
    expect(detail).toContain("/pages/ingredient-detail/index?mealId=${meal.id}&itemId=${itemId}");
    expect(detail).toContain("onClick={() => openIngredient(item.id)}");
    expect(config).toContain('"pages/ingredient-detail/index"');
  });

  it("将详情页底部操作改为图标与文字横向排列", () => {
    const styles = read("styles/page.scss");
    const actionRule = styles.slice(
      styles.indexOf(".meal-detail-page__action {"),
      styles.indexOf(".meal-detail-page__action--delete")
    );

    expect(actionRule).toContain("flex-direction: row");
    expect(actionRule).toContain("min-height: 64px");
  });
});
