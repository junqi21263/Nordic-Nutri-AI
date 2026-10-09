import { shiftDate, type Meal, type MealType } from "../meals/domain";
import type { AppLocale } from "../../i18n/locale";

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

const REMINDER_COPY: Record<AppLocale, {
  missed: { title: string; body: string };
  recorded: { title: string; body: string };
  ordinary: (meal: string) => { title: string; body: string };
  mealLabels: Record<MealReminderType, string>;
}> = {
  "zh-CN": {
    missed: { title: "最近有点忙？", body: "不用补齐，从这一餐重新开始就好。" },
    recorded: { title: "今天也记一下这一餐 🌿", body: "你的记录节奏正在慢慢形成。" },
    ordinary: (meal) => ({ title: `${meal}还没记录吗？`, body: "拍一下就好 📷" }),
    mealLabels: { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" },
  },
  "zh-TW": {
    missed: { title: "最近是不是有點忙？", body: "不用補記，從這一餐重新開始就好。" },
    recorded: { title: "今天也記得這一餐 🌿", body: "你的記錄節奏正在慢慢形成。" },
    ordinary: (meal) => ({ title: `還沒記錄${meal}嗎？`, body: "拍張照片就好 📷" }),
    mealLabels: { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" },
  },
  en: {
    missed: { title: "Been busy lately?", body: "No need to catch up—just start again with this meal." },
    recorded: { title: "Log this meal today 🌿", body: "Your logging rhythm is taking shape." },
    ordinary: (meal) => ({ title: `Haven't logged ${meal} yet?`, body: "A quick photo is all it takes 📷" }),
    mealLabels: { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" },
  },
};

export function getReminderCopy(mealType: MealReminderType, consecutiveMissedDays: number, consecutiveRecordedDays: number, locale: AppLocale = "zh-CN") {
  const copy = REMINDER_COPY[locale];
  if (consecutiveMissedDays >= 2) {
    return copy.missed;
  }
  if (consecutiveRecordedDays >= 2) {
    return copy.recorded;
  }
  return copy.ordinary(copy.mealLabels[mealType]);
}

export function buildTodayReminderCandidates(
  settings: SmartReminderSettings,
  meals: Meal[],
  now = new Date(),
  locale: AppLocale = "zh-CN",
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
      locale,
    );
    candidates.push({ id: getReminderNotificationId(mealType), mealType, ...copy, at });
  }
  return candidates;
}

export function buildNextReminderCandidates(
  settings: SmartReminderSettings,
  meals: Meal[],
  now = new Date(),
  locale: AppLocale = "zh-CN",
): ReminderCandidate[] {
  if (!settings.enabled) return [];
  const today = localDateString(now);
  return reminderTypes.flatMap((mealType) => {
    const mealSettings = settings.meals[mealType];
    if (!mealSettings.enabled || !isReminderTimeInWindow(mealType, mealSettings.time)) return [];
    const [hours, minutes] = mealSettings.time.split(":").map(Number);
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    if (at <= now || hasMeal(meals, today, mealType)) at.setDate(at.getDate() + 1);
    const copy = getReminderCopy(
      mealType,
      consecutiveDays(meals, today, mealType, false),
      consecutiveDays(meals, today, mealType, true),
      locale,
    );
    return [{ id: getReminderNotificationId(mealType), mealType, ...copy, at }];
  });
}
