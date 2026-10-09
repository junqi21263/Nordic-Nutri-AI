import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import type { JourneyStageConfig, JourneyStageState } from "../../features/milestones/journey-stage";
import { MilestoneJourneyIllustration } from "../milestone-journey-illustration";

export function MilestoneStageCard({
  stage,
  state,
  currentDays,
  cover,
  onClick,
}: {
  stage: JourneyStageConfig;
  state: JourneyStageState;
  currentDays: number;
  cover: MilestoneIllustrationAsset;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const locked = state === "locked";
  const stageKey = stage.theme.toLowerCase();
  const status = state === "presented"
    ? t("milestoneJourney.unlocked")
    : state === "pending"
      ? t("milestoneJourney.pending")
      : state === "next"
        ? t("milestoneJourney.daysRemaining", { count: Math.max(stage.milestone - currentDays, 0) })
        : t("milestoneJourney.locked");
  return (
    <View className={`milestone-stage-card milestone-stage-card--${state}`} onClick={onClick} ariaLabel={`${stage.milestone} ${t("milestoneJourney.days")} ${status}`}>
      {state === "next" ? <Text className="milestone-stage-card__next">{t("milestoneJourney.nextBadge")}</Text> : null}
      {locked ? <Text className="milestone-stage-card__lock">⌑</Text> : null}
      <MilestoneJourneyIllustration asset={cover} locked={locked} className="milestone-stage-card__image" />
      <View className="milestone-stage-card__body">
        <Text className="milestone-stage-card__days">{stage.milestone} {t("milestoneJourney.days").toUpperCase()}</Text>
        <Text className="milestone-stage-card__theme">{t(`milestoneJourney.stages.${stageKey}.title`)}</Text>
        <Text className="milestone-stage-card__status">{status}</Text>
        <Text className="milestone-stage-card__collection">{t("milestoneJourney.series", { name: t(`milestoneJourney.stages.${stageKey}.title`) })} · {stage.collectionCount}</Text>
      </View>
    </View>
  );
}
