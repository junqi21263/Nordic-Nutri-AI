import { create } from "zustand";
import type { Achievement } from "../features/coach/domain";

const SEEN_STORAGE_KEY = "nordic.achievements.seenUnlocked";
const BOOTSTRAP_STORAGE_KEY = "nordic.achievements.seenBootstrapped";

export interface AchievementSeenStorage {
  readSeen: (userId: string) => string[];
  writeSeen: (userId: string, ids: string[]) => void;
  isBootstrapped: (userId: string) => boolean;
  markBootstrapped: (userId: string) => void;
}

const memorySeenByUser = new Map<string, Set<string>>();
const memoryBootstrappedUsers = new Set<string>();

function scopedStorageKey(base: string, userId: string) {
  return `${base}.${encodeURIComponent(userId)}`;
}

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
  readSeen: (userId) => {
    const raw = readStorageRaw(scopedStorageKey(SEEN_STORAGE_KEY, userId));
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [...(memorySeenByUser.get(userId) ?? [])];
      }
    }
    return [...(memorySeenByUser.get(userId) ?? [])];
  },
  writeSeen: (userId, ids) => {
    memorySeenByUser.set(userId, new Set(ids));
    writeStorageRaw(scopedStorageKey(SEEN_STORAGE_KEY, userId), JSON.stringify(ids));
  },
  isBootstrapped: (userId) => {
    if (memoryBootstrappedUsers.has(userId)) return true;
    const raw = readStorageRaw(scopedStorageKey(BOOTSTRAP_STORAGE_KEY, userId));
    return raw === true || raw === "1" || raw === 1;
  },
  markBootstrapped: (userId) => {
    memoryBootstrappedUsers.add(userId);
    writeStorageRaw(scopedStorageKey(BOOTSTRAP_STORAGE_KEY, userId), "1");
  },
};

export interface AchievementStore {
  userId: string | null;
  achievements: Achievement[];
  achievementUnlocked: AchievementUnlockedEvent | null;
  pendingAchievementUnlocks: AchievementUnlockedEvent[];
  setAchievements: (achievements: Achievement[]) => void;
  setUserId: (userId: string | null) => void;
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
    userId: null,
    achievements: [],
    achievementUnlocked: null,
    pendingAchievementUnlocks: [],
    setUserId: (userId) => {
      if (get().userId === userId) return;
      set({ userId, achievements: [], achievementUnlocked: null, pendingAchievementUnlocks: [] });
    },
    setAchievements: (achievements) => {
      set({ achievements });
      const userId = get().userId;
      if (!userId) return;
      const unlocked = achievements.filter((item) => item.unlocked);
      if (!seenStorage.isBootstrapped(userId)) {
        seenStorage.writeSeen(userId, unlocked.map((item) => item.id));
        seenStorage.markBootstrapped(userId);
        return;
      }
      const seen = new Set(seenStorage.readSeen(userId));
      const newlyUnlocked = unlocked.filter((item) => !seen.has(item.id));
      if (!newlyUnlocked.length) return;
      seenStorage.writeSeen(userId, [
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
    reset: () => set({ userId: null, achievements: [], achievementUnlocked: null, pendingAchievementUnlocks: [] }),
  }));

export const useAchievementStore = createAchievementStore();
