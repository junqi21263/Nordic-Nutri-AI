import { describe, expect, it } from "vitest";
import {
  createAchievementStore,
  type AchievementSeenStorage,
} from "../src/stores/achievement-store";

describe("achievement unlock toast", () => {
  it("bootstraps existing unlocks without toasting, then announces new ones", () => {
    const announced: string[][] = [];
    let seen: string[] = [];
    let bootstrapped = false;
    const storage: AchievementSeenStorage = {
      readSeen: () => seen,
      writeSeen: (ids) => { seen = [...ids]; },
      isBootstrapped: () => bootstrapped,
      markBootstrapped: () => { bootstrapped = true; },
    };

    const store = createAchievementStore(storage, (titles) => {
      announced.push(titles);
    });

    store.getState().setAchievements([
      { id: "achievement-0", title: "第一餐记录", unlocked: true, progress: 100 },
      { id: "achievement-1", title: "早餐节奏", unlocked: false, progress: 33 },
    ]);
    expect(announced).toEqual([]);
    expect(bootstrapped).toBe(true);
    expect(seen).toEqual(["achievement-0"]);

    store.getState().setAchievements([
      { id: "achievement-0", title: "第一餐记录", unlocked: true, progress: 100 },
      { id: "achievement-1", title: "早餐节奏", unlocked: true, progress: 100 },
    ]);
    expect(announced).toEqual([["早餐节奏"]]);
    expect(seen).toContain("achievement-1");
  });
});
