import { Text, View } from "@tarojs/components";
import { useState } from "react";
import {
  hasSeenFirstRunTip,
  markFirstRunTipSeen,
  type FirstRunTipId,
} from "../../features/first-run-tips/first-run-tips";

export interface FirstRunTipProps {
  tipId: FirstRunTipId;
  /** e.g. "1/3" — shown as a step badge for stronger guidance. */
  step?: string;
  title: string;
  body: string;
  /** Primary CTA; dismissing happens after the action runs. */
  actionLabel?: string;
  onAction?: () => void;
  dismissLabel?: string;
  className?: string;
  onClose?: () => void;
}

/** One-shot coach mark with an optional primary action (stronger than dismiss-only). */
export function FirstRunTip({
  tipId,
  step,
  title,
  body,
  actionLabel,
  onAction,
  dismissLabel = "知道了",
  className = "",
  onClose,
}: FirstRunTipProps) {
  const [visible, setVisible] = useState(() => !hasSeenFirstRunTip(tipId));

  if (!visible) return null;

  const close = () => {
    markFirstRunTipSeen(tipId);
    setVisible(false);
    onClose?.();
  };

  const runAction = () => {
    close();
    onAction?.();
  };

  return (
    <View className={`first-run-tip ${className}`.trim()} ariaLabel={title}>
      <View className="first-run-tip__header">
        {step ? (
          <View className="first-run-tip__step">
            <Text>{step}</Text>
          </View>
        ) : null}
        <Text className="first-run-tip__title">{title}</Text>
      </View>
      <Text className="first-run-tip__body">{body}</Text>
      <View className="first-run-tip__actions">
        {actionLabel && onAction ? (
          <View className="first-run-tip__action first-run-tip__action--primary" onClick={runAction}>
            <Text>{actionLabel}</Text>
          </View>
        ) : null}
        <View
          className={`first-run-tip__action ${actionLabel && onAction ? "first-run-tip__action--ghost" : "first-run-tip__action--primary"}`}
          onClick={close}
          ariaLabel={dismissLabel}
        >
          <Text>{actionLabel && onAction ? dismissLabel : "知道了"}</Text>
        </View>
      </View>
    </View>
  );
}
