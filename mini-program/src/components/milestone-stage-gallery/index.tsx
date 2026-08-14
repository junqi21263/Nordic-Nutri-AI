import { Text, View } from "@tarojs/components";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MilestoneIllustrationAsset } from "../../features/milestones/asset-cache";
import { getMilestoneIllustrationAsset, MILESTONE_ASSET_IDS } from "../../features/milestones/config";
import type { Milestone } from "../../features/milestones/stats";
import { MilestoneJourneyIllustration } from "../milestone-journey-illustration";
import { Modal } from "../modal";

function touchX(event: unknown, key: "touches" | "changedTouches") {
  const touchEvent = event as { touches?: Array<{ clientX?: number }>; changedTouches?: Array<{ clientX?: number }> };
  return touchEvent[key]?.[0]?.clientX;
}

export function MilestoneStageGallery({
  open,
  milestone,
  frozenAsset,
  onClose,
}: {
  open: boolean;
  milestone: Milestone;
  frozenAsset: MilestoneIllustrationAsset;
  onClose: () => void;
}) {
  const assets = useMemo(
    () => MILESTONE_ASSET_IDS[milestone].map((_, index) => getMilestoneIllustrationAsset(milestone, index, frozenAsset.version)),
    [frozenAsset.version, milestone],
  );
  const frozenIndex = Math.max(0, assets.findIndex((asset) => asset.id === frozenAsset.id));
  const [activeIndex, setActiveIndex] = useState(frozenIndex);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    if (open) setActiveIndex(frozenIndex);
  }, [frozenIndex, open]);

  const move = (direction: -1 | 1) => {
    setActiveIndex((index) => (index + direction + assets.length) % assets.length);
  };
  const activeAsset = assets[activeIndex] ?? frozenAsset;
  const isFrozenAsset = activeAsset.id === frozenAsset.id && activeAsset.version === frozenAsset.version;

  return (
    <Modal
      open={open}
      className="milestone-stage-gallery"
      backdropClassName="modal-backdrop--milestone-stage-gallery"
      lockScroll
      onBackdropClick={onClose}
    >
      <View className="milestone-stage-gallery__content">
        <View
          className="milestone-stage-gallery__visual"
          onTouchStart={(event) => { touchStartX.current = touchX(event, "touches") ?? null; }}
          onTouchEnd={(event) => {
            const startX = touchStartX.current;
            const endX = touchX(event, "changedTouches");
            touchStartX.current = null;
            if (startX === null || typeof endX !== "number" || Math.abs(endX - startX) < 36) return;
            move(endX < startX ? 1 : -1);
          }}
        >
          <MilestoneJourneyIllustration asset={activeAsset} className="milestone-stage-gallery__image" />
          {isFrozenAsset ? <Text className="milestone-stage-gallery__frozen">本次解锁</Text> : null}
          {assets.length > 1 ? (
            <>
              <View className="milestone-stage-gallery__nav milestone-stage-gallery__nav--prev" onClick={() => move(-1)} ariaLabel="上一张插画">
                <Text className="milestone-stage-gallery__nav-icon">‹</Text>
              </View>
              <View className="milestone-stage-gallery__nav milestone-stage-gallery__nav--next" onClick={() => move(1)} ariaLabel="下一张插画">
                <Text className="milestone-stage-gallery__nav-icon">›</Text>
              </View>
            </>
          ) : null}
        </View>
        <Text className="milestone-stage-gallery__hint">左右滑动查看 · 点击空白处关闭</Text>
      </View>
    </Modal>
  );
}
