import { Text, View } from "@tarojs/components";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal } from "../modal";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import type { JourneyStageConfig, JourneyStageState } from "../../features/milestones/journey-stage";
import { getJourneyStageIllustrationSeries } from "../../features/milestones/journey-stage";
import { MilestoneJourneyIllustration } from "../milestone-journey-illustration";

export function MilestoneStageSheet({
  open,
  stage,
  state,
  currentDays,
  onClose,
  onContinue,
}: {
  open: boolean;
  stage: JourneyStageConfig | null;
  state: JourneyStageState | null;
  currentDays: number;
  onClose: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const [selectedIllustration, setSelectedIllustration] = useState<MilestoneIllustrationAsset | null>(null);
  if (!stage || !state) return null;
  const pending = state === "pending";
  const stageKey = stage.theme.toLowerCase();
  const status = state === "presented"
    ? t("milestoneJourney.unlocked")
    : state === "pending"
      ? t("milestoneJourney.pending")
      : state === "next"
        ? t("milestoneJourney.daysRemaining", { count: Math.max(stage.milestone - currentDays, 0) })
        : t("milestoneJourney.locked");
  const series = getJourneyStageIllustrationSeries(stage.milestone);
  const close = () => {
    setSelectedIllustration(null);
    onClose();
  };
  const continueJourney = () => {
    setSelectedIllustration(null);
    onContinue();
  };
  return (
    <>
      <Modal open={open} className="milestone-stage-sheet" backdropClassName="modal-backdrop--milestone-stage-sheet" lockScroll>
        <View className="milestone-stage-sheet__content">
          <Text className="milestone-stage-sheet__close" onClick={close}>×</Text>
          <Text className="milestone-stage-sheet__eyebrow">{t(`milestoneJourney.stages.${stageKey}.title`)}</Text>
          <Text className="milestone-stage-sheet__title">{stage.milestone} {t("milestoneJourney.days").toUpperCase()}</Text>
          {pending ? (
            <>
              <Text className="milestone-stage-sheet__status">{t("milestoneJourney.pendingTitle")}</Text>
              <Text className="milestone-stage-sheet__message">{t("milestoneJourney.pendingMessage")}</Text>
              <View className="milestone-stage-sheet__button" onClick={close}><Text>{t("milestoneJourney.acknowledge")}</Text></View>
            </>
          ) : (
            <>
              <Text className="milestone-stage-sheet__status">{status}</Text>
              <Text className="milestone-stage-sheet__message">{t(`milestoneJourney.stages.${stageKey}.message`)}</Text>
              <Text className="milestone-stage-sheet__progress">{t("milestoneJourney.current", { current: Math.min(currentDays, stage.milestone), target: stage.milestone })}</Text>
              <Text className="milestone-stage-sheet__series-label">{t("milestoneJourney.series", { name: t(`milestoneJourney.stages.${stageKey}.title`) })}</Text>
              <View className="milestone-stage-sheet__series">
                {series.map((asset) => (
                  <View key={asset.id} className="milestone-stage-sheet__series-item" onClick={() => setSelectedIllustration(asset)}>
                    <MilestoneJourneyIllustration asset={asset} locked className="milestone-stage-sheet__series-image" />
                  </View>
                ))}
              </View>
              <Text className="milestone-stage-sheet__note">{t("milestoneJourney.seriesNote")}</Text>
              <View className="milestone-stage-sheet__button" onClick={continueJourney}><Text>{t("milestoneJourney.continue")}</Text></View>
            </>
          )}
        </View>
      </Modal>
      <Modal
        open={open && Boolean(selectedIllustration)}
        className="milestone-stage-image-preview"
        backdropClassName="modal-backdrop--milestone-stage-image-preview"
        lockScroll
        onBackdropClick={() => setSelectedIllustration(null)}
      >
        {selectedIllustration ? (
          <View className="milestone-stage-image-preview__content" onClick={(event) => event.stopPropagation()}>
            <MilestoneJourneyIllustration asset={selectedIllustration} className="milestone-stage-image-preview__image" />
            <Text className="milestone-stage-image-preview__caption">{t("milestoneJourney.series", { name: t(`milestoneJourney.stages.${stageKey}.title`) })} · {t("milestoneJourney.previewClose")}</Text>
          </View>
        ) : null}
      </Modal>
    </>
  );
}
