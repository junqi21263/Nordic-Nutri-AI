import { Image, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  placeholder,
  disabled = false,
  selectedImagePath = null,
  onInput,
  onSend,
  onPickImage,
  onClearImage,
}: CoachComposerProps) {
  const layout = useSystemLayout();
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("coachPage.composer.placeholder");
  const [keyboardHeight, setKeyboardHeight] = useState(0);

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
          ariaLabel={t("coachPage.composer.removeImage")}
          onClick={onClearImage}
        >
          <Image
            className="coach-composer__selected-image-preview"
            src={selectedImagePath}
            mode="aspectFill"
          />
        </View>
      ) : null}
      <View className="coach-composer__image-picker" ariaLabel={t("coachPage.composer.chooseFoodImage")} onClick={onPickImage}>
        <NordicIcon name="camera" size={24} ariaLabel={t("coachPage.composer.chooseImage")} />
      </View>
      <View className="coach-composer__field">
        <Textarea
          className="coach-composer__input"
          value={value}
          placeholder={resolvedPlaceholder}
          placeholderClass="coach-composer__input-placeholder"
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
        className={`coach-composer__send ${disabled || (!value.trim() && !selectedImagePath) ? "coach-composer__send--disabled" : ""}`}
        ariaLabel={t("coachPage.composer.sendMessage")}
        onClick={() => {
          if (!disabled && (value.trim() || selectedImagePath)) onSend();
        }}
      >
        <NordicIcon name="arrow-up" size={24} ariaLabel={t("coachPage.composer.send")} />
      </View>
    </View>
  );
}
