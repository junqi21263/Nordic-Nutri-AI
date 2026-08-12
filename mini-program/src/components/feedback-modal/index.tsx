import { useEffect, useState } from "react";
import { View, Text } from "@tarojs/components";
import type { FeedbackModalOptions } from "../../stores/feedback-store";
import { NordicIcon } from "../nordic-icon";

export interface FeedbackModalProps {
  modal: FeedbackModalOptions & { variant: "success" | "limit" | "error" };
  onDismiss: () => void;
}

const exitDuration = 420;
const variantClassName = {
  success: "feedback-modal--success",
  limit: "feedback-modal--limit",
  error: "feedback-modal--error",
} as const;

/** Shared Stitch-aligned feedback surface. The host owns its lifecycle; this component owns exit motion. */
export function FeedbackModal({ modal, onDismiss }: FeedbackModalProps) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    setClosing(false);
  }, [modal]);

  const dismiss = (callback?: () => void) => {
    if (closing) return;
    setClosing(true);
    setTimeout(() => {
      callback?.();
      onDismiss();
    }, exitDuration);
  };

  const handleBackdropClick = () => {
    if (modal.dismissible) dismiss(modal.onClose);
  };

  return (
    <View
      className={`feedback-modal-overlay ${closing ? "feedback-modal-overlay--closing" : ""}`}
      onClick={handleBackdropClick}
    >
      <View
        className={`feedback-modal ${variantClassName[modal.variant]} ${closing ? "feedback-modal--closing" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        {modal.dismissible && !modal.primaryText ? (
          <View className="feedback-modal__close" onClick={() => dismiss(modal.onClose)}>
            <Text aria-label="关闭">×</Text>
          </View>
        ) : null}
        <View className={`feedback-modal__icon feedback-modal__icon--${modal.variant}`}>
          {modal.variant === "success" ? (
            <NordicIcon name="check" size={52} ariaLabel="成功" />
          ) : (
            <Text className="feedback-modal__icon-mark" aria-label={modal.variant === "limit" ? "额度提示" : "错误"}>
              {modal.variant === "limit" ? "!" : "×"}
            </Text>
          )}
        </View>
        <Text className="feedback-modal__title">{modal.title}</Text>
        {modal.description ? <Text className="feedback-modal__description">{modal.description}</Text> : null}
        <View className="feedback-modal__actions">
          <View
            className={`feedback-modal__button feedback-modal__button--${modal.variant} ${modal.primaryText === "好的" ? "feedback-modal__button--short" : ""}`}
            onClick={() => dismiss(modal.onPrimary)}
          >
            <Text>{modal.primaryText}</Text>
          </View>
          {modal.secondaryText ? (
            <View className="feedback-modal__button feedback-modal__button--secondary" onClick={() => dismiss(modal.onSecondary)}>
              <Text>{modal.secondaryText}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
