import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "../bottom-sheet";
import { REMINDER_WINDOWS, type MealReminderType } from "../../features/smart-reminders/domain";
import { clampReminderTime, getReminderTimeOptions } from "../../features/smart-reminders/time-options";
import "./index.scss";

export interface ReminderTimeSheetProps {
  open: boolean;
  mealType: MealReminderType | null;
  time: string;
  onDismiss: () => void;
  onConfirm: (time: string) => void;
}

function ReminderWheel({
  label,
  values,
  selectedIndex,
  onSelect,
}: {
  label: string;
  values: number[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const { t } = useTranslation();
  const selectNext = () => onSelect(Math.min(values.length - 1, selectedIndex + 1));
  const selectPrevious = () => onSelect(Math.max(0, selectedIndex - 1));

  return (
    <View className="reminder-time-sheet__column">
      <Text className="reminder-time-sheet__label">{label}</Text>
      <View className="reminder-time-sheet__wheel">
        <View className="reminder-time-sheet__arrow" ariaLabel={t("reminderTime.increase", { label })} onClick={selectNext} />
        <Text className="reminder-time-sheet__value">{String(values[selectedIndex] ?? values[0] ?? 0).padStart(2, "0")}</Text>
        <View className="reminder-time-sheet__arrow reminder-time-sheet__arrow--down" ariaLabel={t("reminderTime.decrease", { label })} onClick={selectPrevious} />
      </View>
      <Text className="reminder-time-sheet__unit">{t(label === t("reminderTime.hours") ? "reminderTime.hourUnit" : "reminderTime.minuteUnit")}</Text>
    </View>
  );
}

export function ReminderTimeSheet({ open, mealType, time, onDismiss, onConfirm }: ReminderTimeSheetProps) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(time);
  const activeMealType = mealType ?? "breakfast";
  const options = getReminderTimeOptions(activeMealType);

  useEffect(() => {
    if (!open || !mealType) return;
    setDraft(clampReminderTime(mealType, time));
  }, [open, time, mealType]);

  if (!mealType) return null;

  const normalizedDraft = clampReminderTime(mealType, draft);
  const [draftHour, draftMinute] = normalizedDraft.split(":").map(Number);
  const selectedHour = options.hours.includes(draftHour) ? draftHour : options.hours[0]!;
  const selectedMinute = options.minutes.includes(draftMinute) ? draftMinute : options.minutes[0]!;
  const selectedHourIndex = options.hours.indexOf(selectedHour);
  const selectedMinuteIndex = options.minutes.indexOf(selectedMinute);
  const choose = (hour: number, minute: number) => setDraft(`${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`);
  const selectHour = (index: number) => {
    const hour = options.hours[index];
    if (hour !== undefined) choose(hour, selectedMinute);
  };
  const selectMinute = (index: number) => {
    const minute = options.minutes[index];
    if (minute !== undefined) choose(selectedHour, minute);
  };
  const save = () => onConfirm(clampReminderTime(mealType, draft));

  return (
    <BottomSheet open={open} className="reminder-time-sheet" lockScroll onDismiss={onDismiss}>
      <View className="reminder-time-sheet__header">
        <Text className="reminder-time-sheet__title">{t("reminderTime.title", { meal: t(`meals.${mealType}`) })}</Text>
        <Text className="reminder-time-sheet__subtitle">
          {t("reminderTime.subtitle", { meal: t(`meals.${mealType}`), start: REMINDER_WINDOWS[mealType].start, end: REMINDER_WINDOWS[mealType].end })}
        </Text>
      </View>
      <View className="reminder-time-sheet__selector-card">
        <View className="reminder-time-sheet__selectors">
          <ReminderWheel
            label={t("reminderTime.hours")}
            values={options.hours}
            selectedIndex={selectedHourIndex}
            onSelect={selectHour}
          />
          <Text className="reminder-time-sheet__colon">:</Text>
          <ReminderWheel
            label={t("reminderTime.minutes")}
            values={options.minutes}
            selectedIndex={selectedMinuteIndex}
            onSelect={selectMinute}
          />
        </View>
      </View>
      <View className="reminder-time-sheet__actions">
        <View className="reminder-time-sheet__action reminder-time-sheet__action--cancel" onClick={onDismiss}>
          <Text>{t("reminderTime.cancel")}</Text>
        </View>
        <View className="reminder-time-sheet__action reminder-time-sheet__action--confirm" onClick={save}>
          <Text>{t("reminderTime.save")}</Text>
        </View>
      </View>
    </BottomSheet>
  );
}
