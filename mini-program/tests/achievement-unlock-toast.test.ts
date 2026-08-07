import { describe, expect, it } from "vitest";
import {
  createAchievementStore,
  type AchievementSeenStorage,
} from "../src/stores/achievement-store";

describe("achievement unlock toast", () => {
  it("bootstraps existing unlocks without toasting, then announces new ones", () => {
    let seen: string[] = [];
    let bootstrapped = false;
    const storage: AchievementSeenStorage = {
      readSeen: () => seen,
      writeSeen: (_userId, ids) => { seen = [...ids]; },
      isBootstrapped: () => bootstrapped,
      markBootstrapped: () => { bootstrapped = true; },
    };

    const store = createAchievementStore(storage);
    store.getState().setUserId("user-1");

    store.getState().setAchievements([
      { id: "achievement-0", title: "第一餐记录", unlocked: true, progress: 100 },
      { id: "achievement-1", title: "早餐节奏", unlocked: false, progress: 33 },
    ]);
    expect(store.getState().achievementUnlocked).toBeNull();
    expect(bootstrapped).toBe(true);
    expect(seen).toEqual(["achievement-0"]);

    store.getState().setAchievements([
      { id: "achievement-0", title: "第一餐记录", unlocked: true, progress: 100 },
      { id: "achievement-1", title: "早餐节奏", unlocked: true, progress: 100 },
    ]);
    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "achievement-1" });
    expect(seen).toContain("achievement-1");
  });

  it("queues multiple newly unlocked achievements one at a time", () => {
    let seen: string[] = [];
    let bootstrapped = false;
    const storage: AchievementSeenStorage = {
      readSeen: () => seen,
      writeSeen: (_userId, ids) => { seen = [...ids]; },
      isBootstrapped: () => bootstrapped,
      markBootstrapped: () => { bootstrapped = true; },
    };
    const store = createAchievementStore(storage);
    store.getState().setUserId("user-1");

    store.getState().setAchievements([{ id: "existing", title: "第一餐记录", unlocked: true, progress: 100 }]);
    store.getState().setAchievements([
      { id: "existing", title: "第一餐记录", unlocked: true, progress: 100 },
      { id: "new-1", title: "早餐节奏", unlocked: true, progress: 100 },
      { id: "new-2", title: "午餐专注", unlocked: true, progress: 100 },
    ]);

    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "new-1" });
    store.getState().dismissAchievementUnlocked();
    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "new-2" });
    store.getState().dismissAchievementUnlocked();
    expect(store.getState().achievementUnlocked).toBeNull();
  });

  it("tracks seen unlocks independently for each signed-in user", () => {
    const seenByUser = new Map<string, string[]>();
    const bootstrappedUsers = new Set<string>();
    const storage: AchievementSeenStorage = {
      readSeen: (userId) => seenByUser.get(userId) ?? [],
      writeSeen: (userId, ids) => { seenByUser.set(userId, [...ids]); },
      isBootstrapped: (userId) => bootstrappedUsers.has(userId),
      markBootstrapped: (userId) => { bootstrappedUsers.add(userId); },
    };
    const store = createAchievementStore(storage);

    store.getState().setUserId("user-a");
    store.getState().setAchievements([]);
    store.getState().setAchievements([{ id: "achievement-0", title: "第一餐记录", unlocked: true, progress: 100 }]);
    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "achievement-0" });
    store.getState().dismissAchievementUnlocked();

    store.getState().setUserId("user-b");
    store.getState().setAchievements([]);
    store.getState().setAchievements([{ id: "achievement-0", title: "第一餐记录", unlocked: true, progress: 100 }]);
    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "achievement-0" });
  });
});
