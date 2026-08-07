import { describe, expect, it } from "vitest";
import { createAchievementStore } from "../src/stores/achievement-store";

describe("achievement unlock toast", () => {
  it("only announces celebrations that the server marks pending", () => {
    const store = createAchievementStore();
    store.getState().setUserId("user-1");
    store.getState().setAchievements([
      { id: "old", title: "第一餐记录", unlocked: true, progress: 100, celebrationPending: false },
      { id: "new", title: "认识自己", unlocked: true, progress: 100, celebrationPending: true },
    ]);
    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "new" });
  });

  it("does not enqueue the same pending server event twice", () => {
    const store = createAchievementStore();
    store.getState().setUserId("user-1");
    const pending = { id: "new", title: "认识自己", unlocked: true, progress: 100, celebrationPending: true };
    store.getState().setAchievements([pending]);
    store.getState().setAchievements([pending]);
    expect(store.getState().achievementUnlocked).toEqual({ achievementId: "new" });
    expect(store.getState().pendingAchievementUnlocks).toEqual([]);
  });

  it("removes pending delivery only after server acknowledgement succeeds", () => {
    const store = createAchievementStore();
    store.getState().setUserId("user-1");
    store.getState().setAchievements([
      { id: "new", title: "认识自己", unlocked: true, progress: 100, celebrationPending: true },
    ]);
    store.getState().markAchievementCelebrated("new");
    expect(store.getState().achievements[0].celebrationPending).toBe(false);
    store.getState().dismissAchievementUnlocked();
    expect(store.getState().achievementUnlocked).toBeNull();
  });

  it("keeps pending delivery isolated per signed-in user", () => {
    const store = createAchievementStore();
    store.getState().setUserId("user-a");
    store.getState().setAchievements([
      { id: "new", title: "认识自己", unlocked: true, progress: 100, celebrationPending: true },
    ]);
    store.getState().setUserId("user-b");
    expect(store.getState().achievementUnlocked).toBeNull();
  });
});
