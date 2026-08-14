import { Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useCallback, useMemo, useState } from "react";
import { getMilestoneJourney, type ProductMilestoneEvent, type ProductMilestoneJourney } from "../../api/milestone-api";
import { MilestoneJourneyIllustration } from "../../components/milestone-journey-illustration";
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

export default function MilestoneJourneyPage() {
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
      setError("我的旅程暂时无法读取，请稍后重试");
    } finally {
      setLoading(false);
    }
  }, []);

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
      title="我的旅程"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      scrollLocked={Boolean(selectedStage)}
      className="page-layout--milestone-journey"
    >
      <View className="milestone-journey-page">
        <View className="milestone-journey-page__hero">
          <View className="milestone-journey-page__hero-copy">
            <Text className="milestone-journey-page__eyebrow">CURRENT JOURNEY</Text>
            <Text className="milestone-journey-page__headline">连续记录 {streakDays} 天</Text>
            <Text className="milestone-journey-page__next-copy">{nextMilestone ? `距离 ${nextMilestone} DAYS 还有 ${remainingDays} 天` : "你已完成本周期全部里程碑"}</Text>
            <Text className="milestone-journey-page__message">{JOURNEY_STAGE_CONFIG[heroStage].journeyMessage}</Text>
          </View>
          <View className="milestone-journey-page__hero-art">
            <MilestoneJourneyIllustration asset={heroAsset} className="milestone-journey-page__hero-image" />
            <Text className="milestone-journey-page__hero-stage">STAGE {String(MILESTONES.indexOf(heroStage) + 1).padStart(2, "0")}</Text>
          </View>
          <View className="milestone-journey-page__progress" ariaLabel="里程碑进度">
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
        </View>

        {loading ? <View className="milestone-journey-page__state"><Text>正在读取当前旅程…</Text></View> : null}
        {error ? <View className="milestone-journey-page__state"><Text>{error}</Text><Text onClick={() => void load()}>重新尝试</Text></View> : null}
        {!loading && !error ? (
          <>
            <View className="milestone-journey-page__collection-heading">
              <Text>Journey Collection</Text>
              <Text>记录属于你的每一个阶段</Text>
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
