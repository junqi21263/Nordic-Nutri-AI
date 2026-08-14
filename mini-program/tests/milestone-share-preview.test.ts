import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getMilestoneSharePreviewDimensions } from "../src/components/milestone-share-preview/layout";

const pageSource = readFileSync(resolve(process.cwd(), "src/pages/milestone-poster/index.tsx"), "utf8");
const posterSource = readFileSync(resolve(process.cwd(), "src/components/milestone-poster/index.tsx"), "utf8");
const canvasSource = readFileSync(resolve(process.cwd(), "src/components/milestone-poster-canvas/index.tsx"), "utf8");
const previewSource = readFileSync(resolve(process.cwd(), "src/components/milestone-share-preview/index.tsx"), "utf8");
const styles = readFileSync(resolve(process.cwd(), "src/styles/page.scss"), "utf8");

describe("milestone share preview", () => {
  it("uses explicit 5:8 dimensions instead of relying on WXSS aspect-ratio", () => {
    expect(getMilestoneSharePreviewDimensions()).toEqual({ width: 372, height: 595 });
  });

  it("uses the app-owned preview instead of the native action sheet", () => {
    expect(pageSource).not.toContain("showActionSheet");
    expect(pageSource).toContain("MilestoneSharePreview");
    expect(pageSource).toContain("sharePreviewPath");
  });

  it("renders a compact fixed overlay that keeps the underlying page visible", () => {
    expect(styles).toContain(".milestone-share-preview {");
    expect(styles).toContain("position: fixed;");
    expect(styles).toContain(".milestone-share-preview__backdrop {");
    expect(styles).toContain(".milestone-share-preview__image {");
    expect(styles).toContain("flex: 0 0 auto;");
    expect(styles).toContain("overflow: visible;");
    expect(styles).toContain("position: relative;");
    expect(styles).toContain("right: -12px;");
    expect(styles).toContain("top: -12px;");
    expect(previewSource).toContain("getMilestoneSharePreviewDimensions");
  });

  it("uses Chinese stage labels instead of ambiguous English index copy", () => {
    expect(posterSource).toContain("config.stageLabel");
    expect(posterSource).toContain("config.stageNumber");
    expect(posterSource).toContain("config.eyebrow");
    expect(posterSource).not.toContain("MILESTONE · {config.index}");
  });

  it("keeps title number and unit on one typographic baseline", () => {
    expect(posterSource).toContain("milestone-poster__title-number");
    expect(posterSource).toContain("milestone-poster__title-unit");
    expect(styles).toContain("align-items: baseline;");
    expect(styles).toContain("font-variant-numeric: tabular-nums;");
  });

  it("exports the same compact 5:8 card ratio with a right-aligned brand footer", () => {
    expect(canvasSource).toContain("每一次记录，都算数");
    expect(canvasSource).toContain("扫码开始记录");
    expect(canvasSource).toContain("nordic-nutri-logo.png");
    expect(canvasSource).toContain("miniprogram-code.jpg");
    expect(canvasSource).toContain("drawBrandFooter");
    expect(canvasSource).toContain('context.textAlign = "right"');
    expect(canvasSource).toContain('context.globalCompositeOperation = "multiply"');
    expect(canvasSource).toContain("const titleText");
    expect(previewSource).toContain('mode="aspectFit"');
  });
});
