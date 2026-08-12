import { create } from "zustand";
import type { Achievement } from "../features/coach/domain";

export interface AchievementUnlockedEvent {
  achievementId: string;
}

export interface AchievementStore {
  userId: string | null;
  achievements: Achievement[];
  achievementUnlocked: AchievementUnlockedEvent | null;
  /** Local replay state for an already unlocked achievement. Never acknowledged to the server. */
  manualAchievementCelebration: Achievement | null;
  pendingAchievementUnlocks: AchievementUnlockedEvent[];
  /** Prevents a late, stale pending response from replaying an acknowledged celebration. */
  deliveredAchievementIds: string[];
  setAchievements: (achievements: Achievement[]) => void;
  setUserId: (userId: string | null) => void;
  markAchievementCelebrated: (achievementId: string) => void;
  dismissAchievementUnlocked: () => void;
  showAchievementCelebration: (achievement: Achievement) => void;
  dismissManualAchievementCelebration: () => void;
  reset: () => void;
}

/**
 * The server is the source of truth for whether a celebration was delivered.
 * The client only queues achievements explicitly marked celebrationPending.
 */
export const createAchievementStore = () =>
  create<AchievementStore>((set, get) => ({
    userId: null,
    achievements: [],
    achievementUnlocked: null,
    manualAchievementCelebration: null,
    pendingAchievementUnlocks: [],
    deliveredAchievementIds: [],
    setUserId: (userId) => {
      if (get().userId === userId) return;
      set({
        userId,
        achievements: [],
        achievementUnlocked: null,
        manualAchievementCelebration: null,
        pendingAchievementUnlocks: [],
        deliveredAchievementIds: [],
      });
    },
    setAchievements: (achievements) => {
      set({ achievements });
      // This response is already authenticated by the product API. Do not
      // wait for the asynchronous identity bootstrap before delivering a
      // server-confirmed celebration, otherwise a just-finished action such
      // as 收藏 can be lost during startup.
      const active = get().achievementUnlocked;
      const activeIds = new Set([
        ...(active ? [active.achievementId] : []),
        ...get().pendingAchievementUnlocks.map((event) => event.achievementId),
        ...get().deliveredAchievementIds,
      ]);
      const pendingEvents = achievements
        .filter((item) => item.unlocked && item.celebrationPending && !activeIds.has(item.id))
        .map((item) => ({ achievementId: item.id }));
      if (!pendingEvents.length) return;
      const queued = [...get().pendingAchievementUnlocks, ...pendingEvents];
      const nextActive = active ?? queued[0] ?? null;
      const remaining = active ? queued : queued.slice(1);
      set({ achievementUnlocked: nextActive ?? null, pendingAchievementUnlocks: remaining });
    },
    markAchievementCelebrated: (achievementId) => {
      set({
        achievements: get().achievements.map((item) => (
          item.id === achievementId ? { ...item, celebrationPending: false } : item
        )),
        deliveredAchievementIds: Array.from(new Set([
          ...get().deliveredAchievementIds,
          achievementId,
        ])),
      });
    },
    dismissAchievementUnlocked: () => {
      const [nextActive, ...remaining] = get().pendingAchievementUnlocks;
      set({ achievementUnlocked: nextActive ?? null, pendingAchievementUnlocks: remaining });
    },
    showAchievementCelebration: (achievement) => set({ manualAchievementCelebration: achievement }),
    dismissManualAchievementCelebration: () => set({ manualAchievementCelebration: null }),
    reset: () => set({
      userId: null,
      achievements: [],
      achievementUnlocked: null,
      manualAchievementCelebration: null,
      pendingAchievementUnlocks: [],
      deliveredAchievementIds: [],
    }),
  }));

export const useAchievementStore = createAchievementStore();
