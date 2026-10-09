import { Image, Text, View } from "@tarojs/components";
import { NordicIcon } from "../nordic-icon";
import { getMilestoneSharePreviewDimensions, getWeeklySharePreviewDimensions } from "./layout";
import Taro from '@tarojs/taro';
import { useTranslation } from "react-i18next";

export type MilestoneSharePreviewProps = {
  path: string;
  busy?: boolean;
  /** Height occupied by the app top bar; the sheet begins below it. */
  topOffset?: number;
  onClose: () => void;
  onShare?: () => void;
  title?: string;
  aspectRatio?: number;
  showHint?: boolean;
  onRefreshIllustration?: () => void;
  onSave: () => void;
};

/** Project-owned share preview. The page behind it remains visible and dimmed. */
export function MilestoneSharePreview({ path, busy = false, topOffset = 0, title, aspectRatio, showHint = true, onClose, onShare, onRefreshIllustration, onSave }: MilestoneSharePreviewProps) {
  const { t } = useTranslation();
  const previewTitle = title ?? t("milestonePoster.title");
  const previewDimensions = getMilestoneSharePreviewDimensions();
  if (aspectRatio) {
    const { windowWidth, windowHeight } = Taro.getWindowInfo();
    Object.assign(
      previewDimensions,
      getWeeklySharePreviewDimensions(windowWidth, windowHeight, topOffset, aspectRatio),
    );
  }

  return (
    <View
      className={`milestone-share-preview${aspectRatio ? ' milestone-share-preview--weekly' : ''}`}
      style={{ top: `${topOffset}px` }}
      catchMove
      onTouchMove={(event) => {
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <View className="milestone-share-preview__backdrop" onClick={onClose} />
      <View
        className="milestone-share-preview__content"
        onClick={(event) => event.stopPropagation()}
        catchMove
      >
        <View
          className="milestone-share-preview__poster-frame"
          style={{
            width: `${previewDimensions.width}px`,
            height: `${previewDimensions.height}px`,
          }}
        >
          <Image
            className="milestone-share-preview__image"
            src={path}
            mode="aspectFit"
            showMenuByLongpress
            ariaLabel={previewTitle}
          />
          {onRefreshIllustration && (
            <View
              className={`milestone-share-preview__refresh${busy ? " milestone-share-preview__refresh--busy" : ""}`}
              onClick={busy ? undefined : onRefreshIllustration}
              ariaLabel={t("milestonePoster.refreshIllustration")}
              role="button"
            >
              <NordicIcon name="refresh-cw" size={aspectRatio ? 16 : 20} ariaLabel={t("milestonePoster.refreshIllustration")} />
            </View>
          )}
          <View className="milestone-share-preview__close" onClick={onClose} ariaLabel={t("milestonePoster.closePreview")}>
            <NordicIcon name="x" size={aspectRatio ? 20 : 26} ariaLabel={t("milestonePoster.close")} />
          </View>
        </View>
        {showHint && (
          <Text className="milestone-share-preview__hint">
            {onShare ? t("milestonePoster.longPressHint") : t("milestonePoster.privateStatsHint")}
          </Text>
        )}
        <View className="milestone-share-preview__actions">
          <View
            className={`milestone-share-preview__action milestone-share-preview__action--save ${busy ? "milestone-share-preview__action--busy" : ""}`}
            onClick={busy ? undefined : onSave}
          >
            <NordicIcon name="arrow-up" size={24} ariaLabel={t("milestonePoster.saveImage")} />
            <Text>{t("milestonePoster.saveToAlbum")}</Text>
          </View>
          {onShare && <View
            className={`milestone-share-preview__action milestone-share-preview__action--wechat ${busy ? "milestone-share-preview__action--busy" : ""}`}
            onClick={busy ? undefined : onShare}
          >
            <NordicIcon name="share" size={24} ariaLabel={t("milestonePoster.openShare")} />
            <Text>{t("milestonePoster.shareApps")}</Text>
          </View>}
        </View>
      </View>
    </View>
  );
}
