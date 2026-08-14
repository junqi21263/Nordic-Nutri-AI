import { Image, Text, View } from "@tarojs/components";
import { NordicIcon } from "../nordic-icon";
import { getMilestoneSharePreviewDimensions } from "./layout";

export type MilestoneSharePreviewProps = {
  path: string;
  busy?: boolean;
  /** Height occupied by the app top bar; the sheet begins below it. */
  topOffset?: number;
  onClose: () => void;
  onShare: () => void;
  onSave: () => void;
};

/** Project-owned share preview. The page behind it remains visible and dimmed. */
export function MilestoneSharePreview({ path, busy = false, topOffset = 0, onClose, onShare, onSave }: MilestoneSharePreviewProps) {
  const previewDimensions = getMilestoneSharePreviewDimensions();

  return (
    <View
      className="milestone-share-preview"
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
            ariaLabel="里程碑分享卡"
          />
          <View className="milestone-share-preview__close" onClick={onClose} ariaLabel="关闭分享卡预览">
            <NordicIcon name="x" size={26} ariaLabel="关闭" />
          </View>
        </View>
        <Text className="milestone-share-preview__hint">长按保存图片</Text>
        <View className="milestone-share-preview__actions">
          <View
            className={`milestone-share-preview__action milestone-share-preview__action--wechat ${busy ? "milestone-share-preview__action--busy" : ""}`}
            onClick={busy ? undefined : onShare}
          >
            <NordicIcon name="share" size={24} ariaLabel="微信分享" />
            <Text>微信分享</Text>
          </View>
          <View
            className={`milestone-share-preview__action milestone-share-preview__action--save ${busy ? "milestone-share-preview__action--busy" : ""}`}
            onClick={busy ? undefined : onSave}
          >
            <NordicIcon name="arrow-up" size={24} ariaLabel="保存图片" />
            <Text>保存图片</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
