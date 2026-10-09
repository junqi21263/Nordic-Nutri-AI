import { Image, Text, View } from "@tarojs/components";
import { NordicIcon } from "../nordic-icon";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import { getMilestoneIllustration } from "../../features/milestones/config";
import { MILESTONES, type Milestone, type MilestoneHighlight } from "../../features/milestones/stats";
import { useTranslation } from "react-i18next";
import { getLocalizedMilestoneMetrics, getLocalizedMilestoneStage } from "../../features/milestones/localized-presentation";

export type MilestonePosterProps = {
  milestone: Milestone;
  userName?: string;
  personalizedMessage: string;
  illustration?: string;
  /** Optional registry entry used by Canvas for future CDN/cache migration. */
  illustrationAsset?: MilestoneIllustrationAsset;
  /** The page resolves the CDN asset once, then shares this local path with Canvas. */
  illustrationStatus?: "loading" | "ready" | "error";
  onIllustrationRetry?: () => void;
  mealsLogged: number;
  targetCompletionRate?: number;
  recordingConsistency?: number;
  avgProtein?: number;
  avgCarbs?: number;
  avgFat?: number;
  mostLoggedFood?: string;
  mostLoggedFoodCount?: number;
  vsPreviousPeriod?: number;
  targetDays?: number;
  /** Frozen server-selected highlights. Presented posters must not recalculate them. */
  frozenHighlights?: MilestoneHighlight[];
  /** Frozen server progress for presented posters and Canvas exports. */
  progressState?: Array<{ milestone: Milestone; active: boolean }>;
  /** Keeps the final poster geometry mounted while live statistics hydrate. */
  contentPending?: boolean;
  onShare?: () => void;
  /** Opens the read-only stage gallery; it never changes the frozen poster asset. */
  onViewIllustrations?: () => void;
  onContinue?: () => void;
};

export function MilestonePoster(props: MilestonePosterProps) {
  const { t } = useTranslation();
  const illustrationSource = props.illustrationStatus
    ? props.illustration
    : props.illustration ?? props.illustrationAsset?.localSource ?? getMilestoneIllustration(props.milestone);
  const translate = (key: string, options?: { count?: number }) => String(t(key, options));
  const shareMessage = getLocalizedMilestoneStage(props.milestone, "message", translate);
  const shareMetrics = getLocalizedMilestoneMetrics(props, translate);
  const activeMilestones = new Set(
    props.progressState
      ? props.progressState.filter((item) => item.active).map((item) => item.milestone)
      : MILESTONES.filter((value) => value <= props.milestone),
  );

  return (
    <View className="milestone-poster">
      {illustrationSource ? (
        <Image
          className="milestone-poster__illustration"
          src={illustrationSource}
          mode="aspectFill"
          ariaLabel={t("milestonePoster.journeyAria")}
        />
      ) : (
        <View className="milestone-poster__illustration milestone-poster__illustration--placeholder">
          {props.illustrationStatus === "error" ? (
            <Text onClick={props.onIllustrationRetry}>{t("milestonePoster.imageFailed")}</Text>
          ) : <Text>{t("milestonePoster.imageLoading")}</Text>}
        </View>
      )}
      <View className="milestone-poster__body">
        <View className="milestone-poster__meta">
          <Text>{getLocalizedMilestoneStage(props.milestone, "label", translate)}</Text>
          <Text>{getLocalizedMilestoneStage(props.milestone, "number", translate)}</Text>
        </View>
        <Text className="milestone-poster__eyebrow">{getLocalizedMilestoneStage(props.milestone, "eyebrow", translate)}</Text>
        <View className="milestone-poster__title" ariaLabel={getLocalizedMilestoneStage(props.milestone, "number", translate)}>
          <Text className="milestone-poster__title-number">{props.milestone}</Text>
          <Text className="milestone-poster__title-unit">DAYS</Text>
        </View>
        {props.userName ? <Text className="milestone-poster__name">{props.userName}</Text> : null}
        <Text className="milestone-poster__message">{shareMessage}</Text>

        <View className="milestone-poster__highlights milestone-poster__highlights--share">
          {shareMetrics.map((metric) => (
            <View className="milestone-poster__highlight" key={metric.label}>
              <View className="milestone-poster__highlight-label">
                <NordicIcon name={metric.icon} size={20} ariaLabel={metric.label} />
                <Text>{metric.label}</Text>
              </View>
              <View className="milestone-poster__highlight-value">
                <Text>{metric.value}</Text>
              </View>
            </View>
          ))}
        </View>

        <View className="milestone-poster__journey" ariaLabel={t("milestonePoster.journeyAria")}>
          <View className="milestone-poster__journey-line" />
          {MILESTONES.map((value) => (
            <View className="milestone-poster__journey-step" key={value}>
              <View className={activeMilestones.has(value) ? "milestone-poster__journey-dot milestone-poster__journey-dot--active" : "milestone-poster__journey-dot"} />
              <Text>{value}</Text>
            </View>
          ))}
        </View>

        {props.onShare ? (
          <View className="milestone-poster__share" onClick={props.onShare}>
            <NordicIcon name="share" size={22} ariaLabel={t("milestonePoster.generateShare")} />
            <Text>{t("milestonePoster.generateShare")}</Text>
          </View>
        ) : null}
        {props.onContinue ? <Text className="milestone-poster__continue" onClick={props.onContinue}>{t("milestonePoster.continue")}</Text> : null}
        {props.onViewIllustrations ? <Text className="milestone-poster__gallery-link" onClick={props.onViewIllustrations}>{t("milestonePoster.gallery")}</Text> : null}
      </View>
    </View>
  );
}
