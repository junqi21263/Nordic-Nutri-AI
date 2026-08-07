import { create } from "zustand";
import type { Achievement } from "../features/coach/domain";

const SEEN_STORAGE_KEY = "nordic.achievements.seenUnlocked";
const BOOTSTRAP_STORAGE_KEY = "nordic.achievements.seenBootstrapped";

export interface AchievementSeenStorage {
  readSeen: () => string[];
  writeSeen: (ids: string[]) => void;
  isBootstrapped: () => boolean;
  markBootstrapped: () => void;
}

const memorySeen = new Set<string>();
let memoryBootstrapped = false;

function readStorageRaw(key: string): unknown {
  try {
    const bridge = globalThis as {
      wx?: { getStorageSync?: (key: string) => unknown };
      taro?: { getStorageSync?: (key: string) => unknown };
    };
    return bridge.wx?.getStorageSync?.(key) ?? bridge.taro?.getStorageSync?.(key);
  } catch {
    return undefined;
  }
}

function writeStorageRaw(key: string, value: unknown) {
  try {
    const bridge = globalThis as {
      wx?: { setStorageSync?: (key: string, data: unknown) => void };
      taro?: { setStorageSync?: (key: string, data: unknown) => void };
    };
    bridge.wx?.setStorageSync?.(key, value);
    bridge.taro?.setStorageSync?.(key, value);
  } catch {
    // memory fallback only
  }
}

export const taroAchievementSeenStorage: AchievementSeenStorage = {
  readSeen: () => {
    const raw = readStorageRaw(SEEN_STORAGE_KEY);
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [...memorySeen];
      }
    }
    return [...memorySeen];
  },
  writeSeen: (ids) => {
    memorySeen.clear();
    ids.forEach((id) => memorySeen.add(id));
    writeStorageRaw(SEEN_STORAGE_KEY, JSON.stringify(ids));
  },
  isBootstrapped: () => {
    if (memoryBootstrapped) return true;
    const raw = readStorageRaw(BOOTSTRAP_STORAGE_KEY);
    return raw === true || raw === "1" || raw === 1;
  },
  markBootstrapped: () => {
    memoryBootstrapped = true;
    writeStorageRaw(BOOTSTRAP_STORAGE_KEY, "1");
  },
};

export interface AchievementStore {
  achievements: Achievement[];
  achievementUnlocked: AchievementUnlockedEvent | null;
  pendingAchievementUnlocks: AchievementUnlockedEvent[];
  setAchievements: (achievements: Achievement[]) => void;
  dismissAchievementUnlocked: () => void;
  reset: () => void;
}

export interface AchievementUnlockedEvent {
  achievementId: string;
}

export const createAchievementStore = (
  seenStorage: AchievementSeenStorage = taroAchievementSeenStorage,
) =>
  create<AchievementStore>((set, get) => ({
    achievements: [],
    achievementUnlocked: null,
    pendingAchievementUnlocks: [],
    setAchievements: (achievements) => {
      set({ achievements });
      const unlocked = achievements.filter((item) => item.unlocked);
      if (!seenStorage.isBootstrapped()) {
        seenStorage.writeSeen(unlocked.map((item) => item.id));
        seenStorage.markBootstrapped();
        return;
      }
      const seen = new Set(seenStorage.readSeen());
      const newlyUnlocked = unlocked.filter((item) => !seen.has(item.id));
      if (!newlyUnlocked.length) return;
      seenStorage.writeSeen([
        ...seen,
        ...newlyUnlocked.map((item) => item.id),
      ]);
      const nextEvents = newlyUnlocked.map((item) => ({ achievementId: item.id }));
      const current = get();
      const pending = [...current.pendingAchievementUnlocks, ...nextEvents];
      const [nextActive, ...remaining] = current.achievementUnlocked
        ? [current.achievementUnlocked, ...pending]
        : pending;
      set({
        achievementUnlocked: nextActive ?? null,
        pendingAchievementUnlocks: remaining,
      });
    },
    dismissAchievementUnlocked: () => {
      const [nextActive, ...remaining] = get().pendingAchievementUnlocks;
      set({
        achievementUnlocked: nextActive ?? null,
        pendingAchievementUnlocks: remaining,
      });
    },
    reset: () => set({ achievements: [], achievementUnlocked: null, pendingAchievementUnlocks: [] }),
  }));

export const useAchievementStore = createAchievementStore();
