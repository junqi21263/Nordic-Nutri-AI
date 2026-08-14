import { Text, View } from "@tarojs/components";
import { useState } from "react";
import { Modal } from "../modal";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import type { JourneyStageConfig, JourneyStageState } from "../../features/milestones/journey-stage";
import { getJourneyStageIllustrationSeries, getJourneyStageStatusLabel } from "../../features/milestones/journey-stage";
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
  const [selectedIllustration, setSelectedIllustration] = useState<MilestoneIllustrationAsset | null>(null);
  if (!stage || !state) return null;
  const pending = state === "pending";
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
          <Text className="milestone-stage-sheet__eyebrow">{stage.displayTitle}</Text>
          <Text className="milestone-stage-sheet__title">{stage.milestone} DAYS</Text>
          {pending ? (
            <>
              <Text className="milestone-stage-sheet__status">这一阶段已经解锁</Text>
              <Text className="milestone-stage-sheet__message">你的里程碑海报正在等待展示。完成正常领取后，就可以在这里永久回看。</Text>
              <View className="milestone-stage-sheet__button" onClick={close}><Text>知道了</Text></View>
            </>
          ) : (
            <>
              <Text className="milestone-stage-sheet__status">{getJourneyStageStatusLabel(state, currentDays, stage.milestone)}</Text>
              <Text className="milestone-stage-sheet__message">{stage.journeyMessage}</Text>
              <Text className="milestone-stage-sheet__progress">当前：{Math.min(currentDays, stage.milestone)} / {stage.milestone} DAYS</Text>
              <Text className="milestone-stage-sheet__series-label">{stage.displaySeries}</Text>
              <View className="milestone-stage-sheet__series">
                {series.map((asset) => (
                  <View key={asset.id} className="milestone-stage-sheet__series-item" onClick={() => setSelectedIllustration(asset)}>
                    <MilestoneJourneyIllustration asset={asset} locked className="milestone-stage-sheet__series-image" />
                  </View>
                ))}
              </View>
              <Text className="milestone-stage-sheet__note">解锁时系统会为这一段旅程固定其中一张插画</Text>
              <View className="milestone-stage-sheet__button" onClick={continueJourney}><Text>继续记录</Text></View>
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
            <Text className="milestone-stage-image-preview__caption">{stage.displaySeries} · 点击空白处关闭</Text>
          </View>
        ) : null}
      </Modal>
    </>
  );
}
