import { Image, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { NordicIcon } from "../../../../components/nordic-icon";
import { useSystemLayout } from "../../../../hooks/useSystemLayout";

export interface CoachComposerProps {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  selectedImagePath?: string | null;
  onInput: (value: string) => void;
  onSend: () => void;
  onPickImage: () => void;
  onClearImage: () => void;
}

export function CoachComposer({
  value,
  placeholder = "问问营养教练，比如：晚餐吃什么？",
  disabled = false,
  selectedImagePath = null,
  onInput,
  onSend,
  onPickImage,
  onClearImage,
}: CoachComposerProps) {
  const layout = useSystemLayout();
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const showPlaceholder = !value;

  useEffect(() => {
    const handler = (res: { height: number }) => {
      setKeyboardHeight(res.height || 0);
    };
    Taro.onKeyboardHeightChange(handler);
    return () => {
      Taro.offKeyboardHeightChange?.(handler);
    };
  }, []);

  // When keyboard is open, sit right above the keyboard.
  // When keyboard is closed, sit above the tab bar.
  const bottomOffset = keyboardHeight > 0
    ? `${keyboardHeight}px`
    : `calc(${layout.tabBarHeight}px + ${layout.safeBottom}px)`;

  return (
    <View
      className="coach-composer"
      style={{ bottom: bottomOffset }}
    >
      {selectedImagePath ? (
        <View
          className="coach-composer__selected-image"
          ariaLabel="取消已选图片"
          onClick={onClearImage}
        >
          <Image
            className="coach-composer__selected-image-preview"
            src={selectedImagePath}
            mode="aspectFill"
          />
        </View>
      ) : null}
      <View className="coach-composer__image-picker" ariaLabel="选择饮食图片" onClick={onPickImage}>
        <NordicIcon name="camera" size={24} ariaLabel="选择图片" />
      </View>
      <View className="coach-composer__field">
        {showPlaceholder ? (
          <View className="coach-composer__placeholder">
            <Text className="coach-composer__placeholder-text">{placeholder}</Text>
          </View>
        ) : null}
        <Textarea
          className="coach-composer__input"
          value={value}
          maxlength={1000}
          autoHeight
          showConfirmBar={false}
          cursorSpacing={20}
          adjustPosition
          disableDefaultPadding
          onInput={(event) => onInput(event.detail.value)}
          onConfirm={() => onSend()}
        />
      </View>
      <View
        className={`coach-composer__send ${!value.trim() && !selectedImagePath ? "coach-composer__send--disabled" : ""}`}
        ariaLabel="发送消息"
        onClick={() => {
          if (!disabled && (value.trim() || selectedImagePath)) onSend();
        }}
      >
        <NordicIcon name="arrow-up" size={24} ariaLabel="发送" />
      </View>
    </View>
  );
}
