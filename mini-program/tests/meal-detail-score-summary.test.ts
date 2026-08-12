import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("餐食详情评分与营养小结", () => {
  it("使用可响应图片状态的 hero，并把评分依据放进独立弹窗", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const hero = read("components/meal-detail-hero/index.tsx");
    const styles = read("styles/page.scss");

    expect(detail).toContain("<MealDetailHero");
    expect(hero).toContain("meal-detail-page__hero--photo");
    expect(hero).toContain("meal-detail-page__hero--data");
    expect(hero).toContain('className="meal-detail-page__score-badge"');
    expect(hero).toContain('className="meal-detail-page__score-footer"');
    expect(hero).toContain("本餐评分");
    expect(hero).toContain("依据");
    expect(detail).toContain('useState<"score" | "insight" | null>(null)');
    expect(detail).toContain("<Modal open={detailModal !== null}>");
    expect(detail).toContain('setDetailModal("score")');
    expect(detail).toContain("为什么是这个评分？");
    expect(detail).toContain("meal-detail-page__detail-modal");
    expect(detail).not.toContain('className="meal-detail-page__score-card"');
    expect(detail).not.toContain("查看评分依据");
    expect(detail).not.toContain("isScoreDetailOpen");
    expect(styles).toContain(".meal-detail-page__detail-modal");
    expect(styles).toContain(".meal-detail-page__score-badge");
    expect(styles).toContain(".meal-detail-page__score-footer");
    expect(styles).toContain(".meal-detail-page__hero-macro-chip");
  });

  it("将营养小结依据放进独立弹窗，避免撑开详情卡片", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const styles = read("styles/page.scss");

    expect(detail).toContain('className="meal-detail-page__insight-card"');
    expect(detail).toContain("查看建议依据");
    expect(detail).toContain('setDetailModal("insight")');
    expect(detail).toContain("这餐对今日目标的影响");
    expect(detail).not.toContain("isInsightExpanded");
    expect(styles).toContain(".meal-detail-page__score-footer");
    expect(styles).toContain(".meal-detail-page__insight-card");
  });

  it("仅通过“知道了”关闭评分与营养小结弹窗", () => {
    const detail = read("pages/meal-detail/index.tsx");

    expect(detail).toContain('<AppButton size="large" onClick={() => setDetailModal(null)}>');
    expect(detail).toContain("知道了");
    expect(detail).not.toContain("meal-detail-page__detail-modal-close");
    expect(detail).not.toContain('ariaLabel="关闭弹窗"');
  });

  it("仅在真实图片可用时使用全宽照片舞台，并在加载失败时降级数据卡", () => {
    const hero = read("components/meal-detail-hero/index.tsx");
    const styles = read("styles/page.scss");

    expect(hero).toContain('mode="aspectFill"');
    expect(hero).toContain("Taro.previewImage({ current: imageUrl, urls: [imageUrl] })");
    expect(hero).toContain("查看原始餐食照片");
    expect(hero).toContain("onError={() => setImageFailed(true)}");
    expect(hero).toContain("hasValidMealImage(imageUrl)");
    expect(hero).toContain("meal-detail-page__data-hero-arc");
    expect(hero).toContain("MealRatingSummary");
    expect(styles).toContain("aspect-ratio: 16 / 10");
    expect(styles).toContain("object-fit: cover");
  });
});
