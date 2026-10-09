import type { MealReminderType } from "./domain";

const storageKey = "nordic-nutri:pending-reminder:v1";

export interface PendingReminder {
  mealType: MealReminderType;
  createdAt: string;
}

interface StorageDriver {
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
  remove: (key: string) => void;
}

export function createPendingReminderStorage(driver: StorageDriver) {
  return {
    save(mealType: MealReminderType) {
      driver.write(storageKey, { mealType, createdAt: new Date().toISOString() });
    },
    consume(): PendingReminder | null {
      try {
        const value = driver.read(storageKey) as Partial<PendingReminder> | null;
        if (!value || !["breakfast", "lunch", "dinner"].includes(value.mealType ?? "")) return null;
        driver.remove(storageKey);
        return { mealType: value.mealType as MealReminderType, createdAt: String(value.createdAt || "") };
      } catch {
        return null;
      }
    },
  };
}

const taroDriver: StorageDriver = {
  read: (key) => {
    const native = (globalThis as { wx?: { getStorageSync: (key: string) => unknown } }).wx;
    if (native) return native.getStorageSync(key);
    try {
      const value = globalThis.localStorage?.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch {
      return null;
    }
  },
  write: (key, value) => {
    const native = (globalThis as { wx?: { setStorageSync: (key: string, value: unknown) => void } }).wx;
    if (native) {
      native.setStorageSync(key, value);
      return;
    }
    try {
      globalThis.localStorage?.setItem(key, JSON.stringify(value));
    } catch {
      // Storage may be unavailable in an embedded WebView.
    }
  },
  remove: (key) => {
    const native = (globalThis as { wx?: { removeStorageSync: (key: string) => void } }).wx;
    if (native) {
      native.removeStorageSync(key);
      return;
    }
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      // Storage may be unavailable in an embedded WebView.
    }
  },
};

export const pendingReminderStorage = createPendingReminderStorage(taroDriver);
