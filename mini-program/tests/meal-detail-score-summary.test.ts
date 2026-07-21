import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("餐食详情评分与营养小结", () => {
  it("明确展示本餐评分，并把评分依据放进独立弹窗", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const styles = read("styles/page.scss");

    expect(detail).toContain('className="meal-detail-page__score-card"');
    expect(detail).toContain("本餐评分");
    expect(detail).toContain("查看评分依据");
    expect(detail).toContain('useState<"score" | "insight" | null>(null)');
    expect(detail).toContain("<Modal open={detailModal !== null}>");
    expect(detail).toContain('setDetailModal("score")');
    expect(detail).toContain("为什么是这个评分？");
    expect(detail).toContain("meal-detail-page__detail-modal");
    expect(detail).not.toContain("isScoreDetailOpen");
    expect(styles).toContain(".meal-detail-page__detail-modal");
  });

  it("将营养小结依据放进独立弹窗，避免撑开详情卡片", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const styles = read("styles/page.scss");

    expect(detail).toContain('className="meal-detail-page__insight-card"');
    expect(detail).toContain("查看建议依据");
    expect(detail).toContain('setDetailModal("insight")');
    expect(detail).toContain("这餐对今日目标的影响");
    expect(detail).not.toContain("isInsightExpanded");
    expect(styles).toContain(".meal-detail-page__score-card");
    expect(styles).toContain(".meal-detail-page__insight-card");
  });

  it("仅通过“知道了”关闭评分与营养小结弹窗", () => {
    const detail = read("pages/meal-detail/index.tsx");

    expect(detail).toContain('<AppButton size="large" onClick={() => setDetailModal(null)}>');
    expect(detail).toContain("知道了");
    expect(detail).not.toContain("meal-detail-page__detail-modal-close");
    expect(detail).not.toContain('ariaLabel="关闭弹窗"');
  });

  it("使用固定图片舞台兼容横图和竖图，并支持预览原图", () => {
    const detail = read("pages/meal-detail/index.tsx");
    const styles = read("styles/page.scss");

    expect(detail).toContain('mode="aspectFill"');
    expect(detail).toContain("Taro.previewImage({ current: heroImage, urls: [heroImage] })");
    expect(detail).toContain("查看原始餐食照片");
    expect(styles).toContain("aspect-ratio: 4 / 5");
    expect(styles).toContain("object-fit: cover");
  });
});
