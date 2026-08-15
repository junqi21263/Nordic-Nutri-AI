import { Text, View } from "@tarojs/components";
import { NordicIcon } from "../../../../components/nordic-icon";
import {
  formatAnalysisDuration,
  type AnalysisProgressState,
  type AssistantGenerationStatus,
} from "../../../../features/coach/analysis-progress";

export interface AnalysisProgressProps {
  analysis: AnalysisProgressState;
  generationStatus: AssistantGenerationStatus;
  onToggle: () => void;
}

export function AnalysisProgress({ analysis, generationStatus, onToggle }: AnalysisProgressProps) {
  const isAnalyzing = generationStatus === "analyzing";
  const completedAt = analysis.completedAt ?? analysis.startedAt;
  const title = isAnalyzing
    ? analysis.title
    : `已完成分析 · ${formatAnalysisDuration(analysis.startedAt, completedAt)}`;

  return (
    <View className="coach-analysis-progress">
      <View
        className={`coach-analysis-progress__header ${isAnalyzing ? "coach-analysis-progress__header--analyzing" : ""} ${
          analysis.expanded ? "coach-analysis-progress__header--expanded" : ""
        }`}
        ariaLabel={isAnalyzing ? title : analysis.expanded ? "收起分析摘要" : "展开分析摘要"}
        onClick={onToggle}
      >
        <NordicIcon name="sparkles" size={14} ariaLabel="分析摘要" />
        <Text className="coach-analysis-progress__title">{title}</Text>
        {!isAnalyzing ? (
          <NordicIcon
            name="chevron-right"
            size={14}
            ariaLabel={analysis.expanded ? "收起" : "展开"}
          />
        ) : null}
      </View>
      <View
        className={`coach-analysis-progress__steps ${
          analysis.expanded ? "coach-analysis-progress__steps--expanded" : "coach-analysis-progress__steps--collapsed"
        }`}
      >
        {analysis.steps.map((step) => (
          <Text
            key={step.id}
            className={`coach-analysis-progress__step coach-analysis-progress__step--${step.status}`}
          >
            {step.label}
          </Text>
        ))}
      </View>
    </View>
  );
}
