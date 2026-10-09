import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { t as translate } from "../../../../i18n";
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
  const { t } = useTranslation();
  const isAnalyzing = generationStatus === "analyzing";
  const completedAt = analysis.completedAt ?? analysis.startedAt;
  const title = isAnalyzing
    ? translate(analysis.title)
    : t("coachPage.analysisProgress.completed", { duration: formatAnalysisDuration(analysis.startedAt, completedAt) });

  return (
    <View className="coach-analysis-progress">
      <View
        className={`coach-analysis-progress__header ${isAnalyzing ? "coach-analysis-progress__header--analyzing" : ""} ${
          analysis.expanded ? "coach-analysis-progress__header--expanded" : ""
        }`}
        ariaLabel={isAnalyzing ? title : analysis.expanded ? t("coachPage.analysisProgress.collapseSummary") : t("coachPage.analysisProgress.expandSummary")}
        onClick={onToggle}
      >
        <NordicIcon name="sparkles" size={14} ariaLabel={t("coachPage.analysisProgress.summary")} />
        <Text className="coach-analysis-progress__title">{title}</Text>
        {!isAnalyzing ? (
          <NordicIcon
            name="chevron-right"
            size={14}
            ariaLabel={analysis.expanded ? t("coachPage.collapse") : t("coachPage.expand")}
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
            {translate(`coachPage.analysisProgress.steps.${step.label}`)}
          </Text>
        ))}
      </View>
    </View>
  );
}
