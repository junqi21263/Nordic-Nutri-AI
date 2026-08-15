export type AssistantGenerationStatus = "analyzing" | "answering" | "completed" | "error";
export type AnalysisStepStatus = "pending" | "active" | "completed";

export interface AnalysisStep {
  id: string;
  label: string;
  status: AnalysisStepStatus;
}

export interface AnalysisProgressState {
  source: "frontend-summary" | "backend-events";
  startedAt: number;
  completedAt?: number;
  expanded: boolean;
  title: string;
  steps: AnalysisStep[];
}

const dailyContextPattern = /(今天|今日|当天|已吃|吃了|还能吃|剩余)/;
const personalNutritionPattern = /(?:我|我的).{0,8}(?:热量|卡路里|蛋白质|碳水|脂肪|膳食纤维)/;

function createSteps(labels: string[]): AnalysisStep[] {
  return labels.map((label, index) => ({
    id: `analysis-step-${index + 1}`,
    label,
    status: index === 0 ? "active" : "pending",
  }));
}

export function createAnalysisProgress(prompt: string, startedAt: number): AnalysisProgressState {
  const usesDailyNutritionContext = dailyContextPattern.test(prompt) || personalNutritionPattern.test(prompt);
  return {
    source: "frontend-summary",
    startedAt,
    expanded: true,
    title: usesDailyNutritionContext ? "正在分析你的饮食…" : "正在整理营养信息…",
    steps: createSteps(
      usesDailyNutritionContext
        ? ["查看今日饮食记录", "整理当前营养摄入", "生成饮食建议"]
        : ["理解你的问题", "整理相关营养信息", "生成建议"],
    ),
  };
}

function completeAnalysis(analysis: AnalysisProgressState, completedAt: number): AnalysisProgressState {
  return {
    ...analysis,
    completedAt,
    expanded: false,
    steps: analysis.steps.map((step) => ({ ...step, status: "completed" })),
  };
}

export function completeAnalysisForAnswer(analysis: AnalysisProgressState, completedAt: number) {
  return completeAnalysis(analysis, completedAt);
}

export function completeAnalysisForFallback(analysis: AnalysisProgressState, completedAt: number) {
  return completeAnalysis(analysis, completedAt);
}

export function formatAnalysisDuration(startedAt: number, completedAt: number): string {
  const elapsed = Math.max(0, completedAt - startedAt);
  if (elapsed < 1_000) return "<1s";
  return `${Math.round(elapsed / 1_000)}s`;
}
