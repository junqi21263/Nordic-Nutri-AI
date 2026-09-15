import type { MealType } from "./domain";

export type MealGroupExpandedState = Record<MealType, boolean>;

export const DEFAULT_MEAL_GROUP_EXPANDED: MealGroupExpandedState = {
  breakfast: true,
  lunch: true,
  dinner: true,
  snack: true,
};

const storageKey = "nordic-nutri:meal-group-expanded:v1";

interface StorageDriver {
  read: (key: string) => unknown;
  write: (key: string, value: unknown) => void;
}

function normalize(value: unknown): MealGroupExpandedState {
  const state = { ...DEFAULT_MEAL_GROUP_EXPANDED };
  if (!value || typeof value !== "object") return state;
  const source = value as Record<string, unknown>;
  for (const mealType of Object.keys(state) as MealType[]) {
    if (typeof source[mealType] === "boolean") state[mealType] = source[mealType] as boolean;
  }
  return state;
}

export function createMealGroupStateStorage(driver: StorageDriver): {
  load: (userId: string) => MealGroupExpandedState;
  save: (userId: string, state: MealGroupExpandedState) => void;
} {
  return {
    load(userId) {
      try {
        const all = driver.read(storageKey);
        const account = all && typeof all === "object" ? (all as Record<string, unknown>)[userId] : null;
        return normalize(account);
      } catch {
        return { ...DEFAULT_MEAL_GROUP_EXPANDED };
      }
    },
    save(userId, state) {
      try {
        const all = driver.read(storageKey);
        const current = all && typeof all === "object" ? all as Record<string, unknown> : {};
        driver.write(storageKey, { ...current, [userId]: normalize(state) });
      } catch {
        // Local UI preference is best effort.
      }
    },
  };
}

const taroDriver: StorageDriver = {
  read: (key) => {
    const native = (globalThis as { wx?: { getStorageSync: (key: string) => unknown } }).wx;
    if (native) return native.getStorageSync(key);
    const serialized = globalThis.localStorage?.getItem(key);
    return serialized ? JSON.parse(serialized) : null;
  },
  write: (key, value) => {
    const native = (globalThis as { wx?: { setStorageSync: (key: string, value: unknown) => void } }).wx;
    if (native) native.setStorageSync(key, value);
    else globalThis.localStorage?.setItem(key, JSON.stringify(value));
  },
};

export const mealGroupStateStorage = createMealGroupStateStorage(taroDriver);
