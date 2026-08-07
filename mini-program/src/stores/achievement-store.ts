import { create } from "zustand";
import type { Achievement } from "../features/coach/domain";

const SEEN_STORAGE_KEY = "nordic.achievements.seenUnlocked";
const BOOTSTRAP_STORAGE_KEY = "nordic.achievements.seenBootstrapped";
const RECOVERED_STORAGE_KEY = "nordic.achievements.recoveredUnlocks";
const RECOVERY_WINDOW_MS = 30 * 60 * 1000;

export interface AchievementSeenStorage {
  readSeen: (userId: string) => string[];
  writeSeen: (userId: string, ids: string[]) => void;
  isBootstrapped: (userId: string) => boolean;
  markBootstrapped: (userId: string) => void;
  readRecovered?: (userId: string) => string[];
  writeRecovered?: (userId: string, ids: string[]) => void;
}

const memorySeenByUser = new Map<string, Set<string>>();
const memoryBootstrappedUsers = new Set<string>();
const memoryRecoveredByUser = new Map<string, Set<string>>();

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
  readRecovered: (userId) => {
    const raw = readStorageRaw(scopedStorageKey(RECOVERED_STORAGE_KEY, userId));
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [...(memoryRecoveredByUser.get(userId) ?? [])];
      }
    }
    return [...(memoryRecoveredByUser.get(userId) ?? [])];
  },
  writeRecovered: (userId, ids) => {
    memoryRecoveredByUser.set(userId, new Set(ids));
    writeStorageRaw(scopedStorageKey(RECOVERED_STORAGE_KEY, userId), JSON.stringify(ids));
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
  now: () => Date = () => new Date(),
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
      const enqueueUnlocks = (items: Achievement[]) => {
        if (!items.length) return;
        const nextEvents = items.map((item) => ({ achievementId: item.id }));
        const current = get();
        const pending = [...current.pendingAchievementUnlocks, ...nextEvents];
        const [nextActive, ...remaining] = current.achievementUnlocked
          ? [current.achievementUnlocked, ...pending]
          : pending;
        set({
          achievementUnlocked: nextActive ?? null,
          pendingAchievementUnlocks: remaining,
        });
      };
      const recovered = new Set(seenStorage.readRecovered?.(userId) ?? []);
      const nowMs = now().getTime();
      const recentlyMissed = unlocked.filter((item) => {
        if (item.justUnlocked || recovered.has(item.id) || !item.unlockedAt) return false;
        const completedAt = new Date(item.unlockedAt).getTime();
        return Number.isFinite(completedAt) && nowMs - completedAt >= 0 && nowMs - completedAt <= RECOVERY_WINDOW_MS;
      });
      const markRecovered = (items: Achievement[]) => {
        if (!items.length || !seenStorage.writeRecovered) return;
        seenStorage.writeRecovered(userId, [...recovered, ...items.map((item) => item.id)]);
      };
      if (!seenStorage.isBootstrapped(userId)) {
        seenStorage.writeSeen(userId, unlocked.map((item) => item.id));
        seenStorage.markBootstrapped(userId);
        markRecovered(recentlyMissed);
        enqueueUnlocks([...unlocked.filter((item) => item.justUnlocked), ...recentlyMissed]);
        return;
      }
      const seen = new Set(seenStorage.readSeen(userId));
      const newlyUnlocked = unlocked.filter((item) => !seen.has(item.id));
      if (!newlyUnlocked.length && !recentlyMissed.length) return;
      if (newlyUnlocked.length) {
        seenStorage.writeSeen(userId, [
          ...seen,
          ...newlyUnlocked.map((item) => item.id),
        ]);
      }
      markRecovered(recentlyMissed);
      enqueueUnlocks([...newlyUnlocked, ...recentlyMissed.filter((item) => !newlyUnlocked.some((newly) => newly.id === item.id))]);
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
