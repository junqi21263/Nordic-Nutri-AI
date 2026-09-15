import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { NordicIcon } from "../nordic-icon";
import "./index.scss";

export interface ReminderPausedModalProps {
  open: boolean;
  onDismiss: () => void;
}

const exitDuration = 260;

export function ReminderPausedModal({ open, onDismiss }: ReminderPausedModalProps) {
  const [closing, setClosing] = useState(false);
  const [entered, setEntered] = useState(false);

  const dismiss = () => {
    if (closing) return;
    setClosing(true);
    setTimeout(onDismiss, exitDuration);
  };

  useEffect(() => {
    if (!open) {
      setEntered(false);
      return undefined;
    }
    setClosing(false);
    setEntered(false);
    const enterTimer = setTimeout(() => setEntered(true), 16);
    const dismissTimer = setTimeout(() => dismiss(), 4500);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(dismissTimer);
    };
  }, [open]);

  if (!open && !closing) return null;

  return (
    <View className={`reminder-paused-modal ${closing ? "reminder-paused-modal--closing" : ""}`} onClick={dismiss}>
      <View
        className={`reminder-paused-modal__card ${entered ? "reminder-paused-modal__card--entered" : ""} ${closing ? "reminder-paused-modal__card--closing" : ""}`}
        onClick={(event) => event.stopPropagation()}
      >
        <View className="reminder-paused-modal__visual">
          <View className="reminder-paused-modal__ring reminder-paused-modal__ring--outer animate-collapse-ring" />
          <View className="reminder-paused-modal__ring reminder-paused-modal__ring--inner animate-collapse-ring animate-collapse-ring--delayed" />
          <View className="reminder-paused-modal__pedestal">
            <View className="animate-quiet-bell">
              <NordicIcon name="bell-off" size={38} ariaLabel="提醒已关闭" />
            </View>
          </View>
        </View>
        <View className="reminder-paused-modal__copy">
          <Text className="reminder-paused-modal__title">已关闭就餐提醒</Text>
          <Text className="reminder-paused-modal__restart">之后可以随时重新开启</Text>
          <Text className="reminder-paused-modal__note">需要时，我们仍在这里。</Text>
        </View>
        <View className="reminder-paused-modal__button" onClick={dismiss}>
          <Text>知道了</Text>
        </View>
      </View>
    </View>
  );
}
