import { Text, View } from "@tarojs/components";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import type { JourneyStageConfig, JourneyStageState } from "../../features/milestones/journey-stage";
import { getJourneyStageStatusLabel } from "../../features/milestones/journey-stage";
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
  const locked = state === "locked";
  return (
    <View className={`milestone-stage-card milestone-stage-card--${state}`} onClick={onClick} ariaLabel={`${stage.milestone} DAYS ${getJourneyStageStatusLabel(state, currentDays, stage.milestone)}`}>
      {state === "next" ? <Text className="milestone-stage-card__next">NEXT</Text> : null}
      {locked ? <Text className="milestone-stage-card__lock">⌑</Text> : null}
      <MilestoneJourneyIllustration asset={cover} locked={locked} className="milestone-stage-card__image" />
      <View className="milestone-stage-card__body">
        <Text className="milestone-stage-card__days">{stage.milestone} DAYS</Text>
        <Text className="milestone-stage-card__theme">{stage.displayTitle}</Text>
        <Text className="milestone-stage-card__status">{getJourneyStageStatusLabel(state, currentDays, stage.milestone)}</Text>
        <Text className="milestone-stage-card__collection">{stage.displaySeries} · {stage.collectionCount}</Text>
      </View>
    </View>
  );
}
