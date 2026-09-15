import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { NordicIcon } from "../nordic-icon";
import "./index.scss";

export interface ReminderAlarmModalProps {
  open: boolean;
  title: string;
  mealName?: string;
  time?: string;
  onDismiss: () => void;
}

const exitDuration = 300;

export function ReminderAlarmModal({ open, title, mealName, time, onDismiss }: ReminderAlarmModalProps) {
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
    const timer = setTimeout(() => dismiss(), 4500);
    return () => {
      clearTimeout(enterTimer);
      clearTimeout(timer);
    };
  }, [open]);

  if (!open && !closing) return null;

  return (
    <View className={`reminder-alarm-modal ${closing ? "reminder-alarm-modal--closing" : ""}`} onClick={dismiss}>
      <View className={`reminder-alarm-modal__card ${entered ? "reminder-alarm-modal__card--entered" : ""} ${closing ? "reminder-alarm-modal__card--closing" : ""}`} onClick={(event) => event.stopPropagation()}>
        <View className="reminder-alarm-modal__visual">
          <View className="reminder-alarm-modal__ripple reminder-alarm-modal__ripple--one animate-ripple-1" />
          <View className="reminder-alarm-modal__ripple reminder-alarm-modal__ripple--two animate-ripple-2" />
          <View className="reminder-alarm-modal__pedestal">
            <View className="animate-alarm-wobble">
              <NordicIcon name="alarm-clock" size={40} ariaLabel="闹钟提醒" />
            </View>
          </View>
        </View>
        <View className="reminder-alarm-modal__copy">
          <Text className="reminder-alarm-modal__title">{title}</Text>
          <Text className="reminder-alarm-modal__subtitle">
            {time && mealName ? (
              <>
                每天 <Text className="reminder-alarm-modal__time">{time}</Text>，轻轻提醒你记录{mealName}
              </>
            ) : "将在预设餐点时间轻轻唤醒记录"}
          </Text>
          <Text className="reminder-alarm-modal__note">温和守护你的每一餐日常节奏</Text>
        </View>
        <View className="reminder-alarm-modal__button" onClick={dismiss}>
          <Text>已设好，静候美味</Text>
        </View>
      </View>
    </View>
  );
}
