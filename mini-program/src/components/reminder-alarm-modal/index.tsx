import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
              <NordicIcon name="alarm-clock" size={40} ariaLabel={t("reminderAlarm.icon")} />
            </View>
          </View>
        </View>
        <View className="reminder-alarm-modal__copy">
          <Text className="reminder-alarm-modal__title">{title}</Text>
          <Text className="reminder-alarm-modal__subtitle">
            {time && mealName ? (
              <>
                {t("reminderAlarm.daily", { time, meal: mealName })}
              </>
            ) : t("reminderAlarm.fallback")}
          </Text>
          <Text className="reminder-alarm-modal__note">{t("reminderAlarm.note")}</Text>
        </View>
        <View className="reminder-alarm-modal__button" onClick={dismiss}>
          <Text>{t("reminderAlarm.confirm")}</Text>
        </View>
      </View>
    </View>
  );
}
