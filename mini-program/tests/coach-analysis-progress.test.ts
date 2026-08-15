import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  completeAnalysisForAnswer,
  createAnalysisProgress,
  formatAnalysisDuration,
  completeAnalysisForFallback,
} from "../src/features/coach/analysis-progress";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("coach analysis progress", () => {
  it("uses current-day nutrition summaries only for prompts backed by the daily context", () => {
    const analysis = createAnalysisProgress("我今天蛋白质是不是吃少了？", 100);

    expect(analysis).toMatchObject({
      source: "frontend-summary",
      startedAt: 100,
      expanded: true,
    });
    expect(analysis.steps.map((step) => step.label)).toEqual([
      "查看今日饮食记录",
      "整理当前营养摄入",
      "生成饮食建议",
    ]);
    expect(analysis.steps.map((step) => step.status)).toEqual(["active", "pending", "pending"]);
  });

  it("uses generic summaries for knowledge questions without claiming unavailable data", () => {
    const analysis = createAnalysisProgress("鸡胸肉蛋白质高吗？", 100);

    expect(analysis.steps.map((step) => step.label)).toEqual([
      "理解你的问题",
      "整理相关营养信息",
      "生成建议",
    ]);
  });

  it("completes and collapses immediately when the first answer delta arrives", () => {
    const completed = completeAnalysisForAnswer(createAnalysisProgress("今天还能吃多少？", 100), 240);

    expect(completed).toMatchObject({ completedAt: 240, expanded: false });
    expect(completed.steps.map((step) => step.status)).toEqual(["completed", "completed", "completed"]);
  });

  it("also completes analysis after a successful non-streaming fallback", () => {
    const completed = completeAnalysisForFallback(createAnalysisProgress("晚餐怎么搭配？", 100), 2_100);

    expect(completed.completedAt).toBe(2_100);
    expect(formatAnalysisDuration(completed.startedAt, completed.completedAt)).toBe("2s");
  });

  it("formats sub-second analysis duration without inventing a full second", () => {
    expect(formatAnalysisDuration(100, 180)).toBe("<1s");
  });
});

describe("analysis progress presentation", () => {
  it("keeps the completed header tappable and the progress in the assistant message flow", () => {
    const component = read("src/pages/coach/components/AnalysisProgress/index.tsx");
    const styles = read("src/styles/page.scss");

    expect(component).toContain("已完成分析");
    expect(component).toContain("onToggle");
    expect(component).toContain('name="sparkles"');
    expect(component).toContain('name="chevron-right"');
    expect(styles).toContain(".coach-analysis-progress__header");
    expect(styles).toContain(".coach-analysis-progress__steps--collapsed");
    expect(styles).toContain("max-height");
    expect(styles).toContain("transition");
  });

  it("keeps analysis on the one streaming coach placeholder through delta, fallback, and completion", () => {
    const page = read("src/pages/coach/index.tsx");
    const api = read("src/api/coach-api.ts");

    expect(page).toContain('generationStatus: "analyzing"');
    expect(page).toContain("createAnalysisProgress");
    expect(page).toContain("completeAnalysisForAnswer");
    expect(page).toContain("completeAnalysisForFallback");
    expect(page).toContain("<AnalysisProgress");
    expect(page).toContain("activeStreamRef");
    expect(page).toContain("COACH_STREAM_ABORTED");
    expect(page).toContain("useDidHide");
    expect(api).toContain("ProductCoachStreamRequest");
    expect(api).toContain("abort: () => void");
  });

  it("does not attach made-up analysis metadata to loaded history", () => {
    const page = read("src/pages/coach/index.tsx");
    const historyStart = page.indexOf("void getProductCoachMessages()");
    const historyEnd = page.indexOf("  }, []);", historyStart) + "  }, []);".length;
    const historyBlock = page.slice(historyStart, historyEnd);

    expect(historyBlock).not.toContain("createAnalysisProgress");
    expect(historyBlock).not.toContain("generationStatus");
  });
});
