import { REMINDER_WINDOWS, type MealReminderType } from "./domain";

const minuteOptions = Array.from({ length: 12 }, (_, index) => index * 5);
export const reminderWheelRowHeight = 56;

export function reminderWheelIndexFromScrollTop(scrollTop: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.round(scrollTop / reminderWheelRowHeight)));
}

export function reminderWheelScrollTop(index: number, length: number) {
  if (length <= 0) return 0;
  return Math.max(0, Math.min(length - 1, Math.round(index))) * reminderWheelRowHeight;
}

export function getReminderTimeOptions(mealType: MealReminderType) {
  const window = REMINDER_WINDOWS[mealType];
  const startHour = Number(window.start.slice(0, 2));
  const endHour = Number(window.end.slice(0, 2));
  return {
    hours: Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index),
    minutes: minuteOptions,
  };
}

export function clampReminderTime(mealType: MealReminderType, value: string) {
  const window = REMINDER_WINDOWS[mealType];
  const [rawHour, rawMinute] = value.split(":").map(Number);
  const requested = Number.isFinite(rawHour) && Number.isFinite(rawMinute)
    ? rawHour * 60 + rawMinute
    : Number(window.start.slice(0, 2)) * 60;
  const start = Number(window.start.slice(0, 2)) * 60;
  const end = Number(window.end.slice(0, 2)) * 60;
  const rounded = Math.round(requested / 5) * 5;
  const minutes = Math.min(end, Math.max(start, rounded));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
