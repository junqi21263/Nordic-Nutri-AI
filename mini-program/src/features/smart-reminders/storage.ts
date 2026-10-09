import {
  DEFAULT_SMART_REMINDER_SETTINGS,
  REMINDER_WINDOWS,
  type MealReminderType,
  type SmartReminderSettings,
} from "./domain";

const storageKey = "nordic-nutri:smart-reminders:v1";
type StoredSettings = Record<string, SmartReminderSettings>;

interface StorageDriver {
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
}

export interface SmartReminderStorage {
  load: (userId: string) => SmartReminderSettings;
  save: (userId: string, settings: SmartReminderSettings) => void;
  clear: (userId: string) => void;
}

const taroDriver: StorageDriver = {
  read: (key) => {
    const runtime = globalThis as typeof globalThis & { wx?: { getStorageSync: (storageKey: string) => unknown } };
    const nativeValue = runtime.wx?.getStorageSync(key);
    if (nativeValue !== undefined && nativeValue !== null && nativeValue !== "") return nativeValue;
    const serialized = globalThis.localStorage?.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  },
  write: (key, value) => {
    const runtime = globalThis as typeof globalThis & { wx?: { setStorageSync: (storageKey: string, storageValue: unknown) => void } };
    if (runtime.wx) {
      runtime.wx.setStorageSync(key, value);
      return;
    }
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  },
};

function cloneDefaults(): SmartReminderSettings {
  return {
    enabled: DEFAULT_SMART_REMINDER_SETTINGS.enabled,
    meals: {
      breakfast: { ...DEFAULT_SMART_REMINDER_SETTINGS.meals.breakfast },
      lunch: { ...DEFAULT_SMART_REMINDER_SETTINGS.meals.lunch },
      dinner: { ...DEFAULT_SMART_REMINDER_SETTINGS.meals.dinner },
    },
  };
}

function readMap(driver: StorageDriver): StoredSettings {
  try {
    const value = driver.read(storageKey);
    return value && typeof value === "object" ? value as StoredSettings : {};
  } catch {
    return {};
  }
}

function normalizeSettings(value: unknown): SmartReminderSettings {
  const defaults = cloneDefaults();
  if (!value || typeof value !== "object") return defaults;
  const source = value as Partial<SmartReminderSettings>;
  const meals = source.meals && typeof source.meals === "object"
    ? source.meals as Partial<SmartReminderSettings["meals"]>
    : {};
  for (const mealType of Object.keys(REMINDER_WINDOWS) as MealReminderType[]) {
    const row = meals[mealType];
    if (!row || typeof row !== "object") continue;
    if (typeof row.enabled === "boolean") defaults.meals[mealType].enabled = row.enabled;
    if (typeof row.time === "string") defaults.meals[mealType].time = row.time;
  }
  if (typeof source.enabled === "boolean") defaults.enabled = source.enabled;
  return defaults;
}

export function createSmartReminderStorage(driver: StorageDriver = taroDriver): SmartReminderStorage {
  return {
    load(userId: string) {
      return normalizeSettings(readMap(driver)[userId]);
    },
    save(userId: string, settings: SmartReminderSettings) {
      try {
        driver.write(storageKey, { ...readMap(driver), [userId]: normalizeSettings(settings) });
      } catch {
        // Reminder preferences are best-effort local settings and never block navigation.
      }
    },
    clear(userId: string) {
      try {
        const current = readMap(driver);
        delete current[userId];
        driver.write(storageKey, current);
      } catch {
        // Best-effort cleanup.
      }
    },
  };
}

export const smartReminderStorage = createSmartReminderStorage();
