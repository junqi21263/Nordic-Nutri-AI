import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMilestoneJourney, type ProductMilestoneEvent, type ProductMilestoneJourney } from "../../api/milestone-api";
import { MilestoneJourneyIllustration } from "../../components/milestone-journey-illustration";
import { Loading } from "../../components/loading";
import { MilestoneStageCard } from "../../components/milestone-stage-card";
import { MilestoneStageSheet } from "../../components/milestone-stage-sheet";
import { getMilestoneIllustrationAssetById } from "../../features/milestones/config";
import { getCurrentJourneyEvents, getCurrentJourneyMilestoneEvent, getHighestPresentedMilestone, getNextMilestone } from "../../features/milestones/journey";
import { JOURNEY_STAGE_CONFIG, getJourneyStageState, getRepresentativeJourneyCover, type JourneyStageConfig, type JourneyStageState } from "../../features/milestones/journey-stage";
import { getMilestonePosterUrl } from "../../features/milestones/runtime";
import { MILESTONES, type Milestone } from "../../features/milestones/stats";
import { PageLayout } from "../../layouts/page-layout";

type SelectedStage = { stage: JourneyStageConfig; state: JourneyStageState } | null;

function snapshotIllustrationAsset(event: ProductMilestoneEvent | null) {
  const snapshot = event?.presentation_snapshot;
  if (!event || !snapshot?.illustrationId) return null;
  const rawVersion = snapshot.illustrationVersion;
  const version = typeof rawVersion === "number"
    ? `v${rawVersion}`
    : typeof rawVersion === "string" && rawVersion.trim()
      ? (rawVersion.startsWith("v") ? rawVersion : `v${rawVersion}`)
      : "v1";
  return getMilestoneIllustrationAssetById(event.milestone, snapshot.illustrationId, version);
}

function currentJourneyStage(streakDays: number): Milestone {
  return [...MILESTONES].reverse().find((milestone) => streakDays >= milestone) ?? 3;
}

function MilestoneJourneySkeleton() {
  const { t } = useTranslation();
  return <View className="milestone-journey-page__skeleton" ariaLabel={t("milestoneJourney.loading")}>
    <Loading label={`${t("milestoneJourney.loading")}…`} />
    <View className="milestone-journey-page__skeleton-hero skeleton" />
    <View className="milestone-journey-page__skeleton-heading skeleton" />
    <View className="milestone-journey-page__skeleton-collection">
      {[0, 1, 2, 3].map((index) => <View className="milestone-journey-page__skeleton-card skeleton" key={index} />)}
    </View>
  </View>;
}

export default function MilestoneJourneyPage() {
  const { t } = useTranslation();
  const [journey, setJourney] = useState<ProductMilestoneJourney | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStage, setSelectedStage] = useState<SelectedStage>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setJourney(await getMilestoneJourney());
    } catch (reason) {
      console.error("[milestones] journey load failed:", reason);
      setError(t("milestoneJourney.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useDidShow(() => { void load(); });

  const streakDays = journey?.currentStreakDays ?? 0;
  const currentEvents = useMemo(() => journey ? getCurrentJourneyEvents(journey) : [], [journey]);
  const latestPoster = getHighestPresentedMilestone(currentEvents);
  const nextMilestone = getNextMilestone(streakDays);
  const heroStage = currentJourneyStage(streakDays);
  const heroAsset = snapshotIllustrationAsset(latestPoster) ?? getRepresentativeJourneyCover(heroStage);
  const remainingDays = nextMilestone ? Math.max(nextMilestone - streakDays, 0) : 0;
  const openPoster = (eventId: string) => Taro.navigateTo({ url: getMilestonePosterUrl({ eventId }) });
  const openStage = (stage: JourneyStageConfig, state: JourneyStageState, event: ProductMilestoneEvent | null) => {
    if (state === "presented" && event) {
      openPoster(event.id);
      return;
    }
    setSelectedStage({ stage, state });
  };

  return (
    <PageLayout
      title={t("milestoneJourney.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      scrollLocked={Boolean(selectedStage)}
      className="page-layout--milestone-journey"
    >
      <View className="milestone-journey-page">
        {loading ? <MilestoneJourneySkeleton /> : <View className="milestone-journey-page__hero">
          <View className="milestone-journey-page__hero-copy">
            <Text className="milestone-journey-page__eyebrow">CURRENT JOURNEY</Text>
            <Text className="milestone-journey-page__headline">{t("milestoneJourney.streak", { count: streakDays })}</Text>
            <Text className="milestone-journey-page__next-copy">{nextMilestone ? t("milestoneJourney.next", { count: nextMilestone, remaining: remainingDays }) : t("milestoneJourney.completed")}</Text>
            <Text className="milestone-journey-page__message">{t(`milestoneJourney.stages.${JOURNEY_STAGE_CONFIG[heroStage].theme.toLowerCase()}.message`)}</Text>
          </View>
          <View className="milestone-journey-page__hero-art">
            <MilestoneJourneyIllustration asset={heroAsset} className="milestone-journey-page__hero-image" />
            <Text className="milestone-journey-page__hero-stage">STAGE {String(MILESTONES.indexOf(heroStage) + 1).padStart(2, "0")}</Text>
          </View>
          <View className="milestone-journey-page__progress" ariaLabel={t("milestoneJourney.progress")}>
            {MILESTONES.map((milestone) => {
              const event = getCurrentJourneyMilestoneEvent(currentEvents, milestone);
              const state = getJourneyStageState({ milestone, event, nextMilestone });
              return (
                <View key={milestone} className={`milestone-journey-page__step milestone-journey-page__step--${state}`}>
                  <View className="milestone-journey-page__node" />
                  <Text>{milestone}</Text>
                </View>
              );
            })}
          </View>
        </View>}

        {error ? <View className="milestone-journey-page__state"><Text>{error}</Text><Text onClick={() => void load()}>{t("milestoneJourney.retry")}</Text></View> : null}
        {!loading && !error ? (
          <>
            <View className="milestone-journey-page__collection-heading">
              <Text>{t("milestoneJourney.collection")}</Text>
              <Text>{t("milestoneJourney.collectionSubtitle")}</Text>
            </View>
            <View className="milestone-journey-page__collection">
              {MILESTONES.map((milestone) => {
                const stage = JOURNEY_STAGE_CONFIG[milestone];
                const event = getCurrentJourneyMilestoneEvent(currentEvents, milestone);
                const state = getJourneyStageState({ milestone, event, nextMilestone });
                return (
                  <MilestoneStageCard
                    key={milestone}
                    stage={stage}
                    state={state}
                    currentDays={streakDays}
                    cover={getRepresentativeJourneyCover(milestone)}
                    onClick={() => openStage(stage, state, event)}
                  />
                );
              })}
            </View>
          </>
        ) : null}
      </View>
      <MilestoneStageSheet
        open={Boolean(selectedStage)}
        stage={selectedStage?.stage ?? null}
        state={selectedStage?.state ?? null}
        currentDays={streakDays}
        onClose={() => setSelectedStage(null)}
        onContinue={() => {
          setSelectedStage(null);
          void Taro.switchTab({ url: "/pages/home/index" });
        }}
      />
    </PageLayout>
  );
}
