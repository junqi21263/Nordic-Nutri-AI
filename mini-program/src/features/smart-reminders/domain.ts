import { shiftDate, type Meal, type MealType } from "../meals/domain";

export type MealReminderType = Exclude<MealType, "snack">;

export interface SmartReminderSettings {
  enabled: boolean;
  meals: Record<MealReminderType, { enabled: boolean; time: string }>;
}

export interface ReminderWindow {
  label: string;
  start: string;
  end: string;
}

export interface ReminderCandidate {
  id: number;
  mealType: MealReminderType;
  title: string;
  body: string;
  at: Date;
}

export const REMINDER_WINDOWS: Record<MealReminderType, ReminderWindow> = {
  breakfast: { label: "早餐", start: "07:00", end: "10:00" },
  lunch: { label: "午餐", start: "11:00", end: "14:00" },
  dinner: { label: "晚餐", start: "17:00", end: "21:00" },
};

export const DEFAULT_SMART_REMINDER_SETTINGS: SmartReminderSettings = {
  enabled: false,
  meals: {
    breakfast: { enabled: true, time: "08:30" },
    lunch: { enabled: true, time: "12:30" },
    dinner: { enabled: true, time: "19:00" },
  },
};

const reminderTypes: MealReminderType[] = ["breakfast", "lunch", "dinner"];
const notificationIds: Record<MealReminderType, number> = {
  breakfast: 17_001,
  lunch: 17_002,
  dinner: 17_003,
};

function timeToMinutes(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function localDateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function hasMeal(meals: Meal[], date: string, mealType: MealReminderType) {
  return meals.some((meal) => meal.date === date && meal.mealType === mealType);
}

function consecutiveDays(meals: Meal[], today: string, mealType: MealReminderType, recorded: boolean) {
  let count = 0;
  for (let offset = 1; offset <= 7; offset += 1) {
    const exists = hasMeal(meals, shiftDate(today, -offset), mealType);
    if (exists !== recorded) break;
    count += 1;
  }
  return count;
}

export function isReminderTimeInWindow(mealType: MealReminderType, time: string) {
  const value = timeToMinutes(time);
  const window = REMINDER_WINDOWS[mealType];
  const start = timeToMinutes(window.start);
  const end = timeToMinutes(window.end);
  return value !== null && start !== null && end !== null && value >= start && value <= end;
}

export function getReminderNotificationId(mealType: MealReminderType) {
  return notificationIds[mealType];
}

export function getReminderCopy(mealType: MealReminderType, consecutiveMissedDays: number, consecutiveRecordedDays: number) {
  if (consecutiveMissedDays >= 2) {
    return { title: "最近有点忙？", body: "不用补齐，从这一餐重新开始就好。" };
  }
  if (consecutiveRecordedDays >= 2) {
    return { title: "今天也记一下这一餐 🌿", body: "你的记录节奏正在慢慢形成。" };
  }
  return { title: `${REMINDER_WINDOWS[mealType].label}还没记录吗？`, body: "拍一下就好 📷" };
}

export function buildTodayReminderCandidates(
  settings: SmartReminderSettings,
  meals: Meal[],
  now = new Date(),
): ReminderCandidate[] {
  if (!settings.enabled) return [];
  const today = localDateString(now);
  const candidates: ReminderCandidate[] = [];
  for (const mealType of reminderTypes) {
    const mealSettings = settings.meals[mealType];
    if (!mealSettings.enabled || !isReminderTimeInWindow(mealType, mealSettings.time) || hasMeal(meals, today, mealType)) continue;
    const [hours, minutes] = mealSettings.time.split(":").map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
    if (at <= now) continue;
    const copy = getReminderCopy(
      mealType,
      consecutiveDays(meals, today, mealType, false),
      consecutiveDays(meals, today, mealType, true),
    );
    candidates.push({ id: getReminderNotificationId(mealType), mealType, ...copy, at });
  }
  return candidates;
}
