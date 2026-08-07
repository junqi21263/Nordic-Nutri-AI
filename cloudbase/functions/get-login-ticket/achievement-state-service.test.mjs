import assert from "node:assert/strict";
import test from "node:test";

import { createAchievementStateService } from "./achievement-state-service.cjs";

test("keeps a completed achievement after its live condition later becomes false", async () => {
  let rows = [];
  const db = {
    from(table) {
      assert.equal(table, "user_achievements");
      const query = {
        select() { return query; },
        eq() { return query; },
        then(resolve) { return Promise.resolve(resolve({ data: rows, error: null })); },
        async upsert(input) {
          rows = [...rows, ...input];
          return { data: input, error: null };
        },
      };
      return query;
    },
  };
  const service = createAchievementStateService({ db, clock: () => new Date("2026-08-07T08:00:00.000Z") });

  const unlocked = await service.reconcile("user-1", [
    { id: "achievement-18", title: "收藏灵感", unlocked: true, unlockedAt: "2026-08-07T08:00:00.000Z" },
  ]);
  const retained = await service.reconcile("user-1", [
    { id: "achievement-18", title: "收藏灵感", unlocked: false, unlockedAt: null },
  ]);

  assert.equal(unlocked[0].unlocked, true);
  assert.equal(unlocked[0].justUnlocked, true);
  assert.equal(retained[0].unlocked, true);
  assert.equal(retained[0].justUnlocked, false);
  assert.equal(retained[0].unlockedAt, "2026-08-07T08:00:00.000Z");
  assert.equal(rows.length, 1);
});

test("uses a conflict-safe write when completion checks overlap", async () => {
  let receivedOptions;
  const db = {
    from(table) {
      assert.equal(table, "user_achievements");
      const query = {
        select() { return query; },
        eq() { return query; },
        then(resolve) { return Promise.resolve(resolve({ data: [], error: null })); },
        async upsert(rows, options) {
          receivedOptions = options;
          return { data: rows, error: null };
        },
      };
      return query;
    },
  };
  const service = createAchievementStateService({ db, clock: () => new Date("2026-08-07T08:00:00.000Z") });

  const [achievement] = await service.reconcile("user-1", [
    { id: "profile_complete", unlocked: true, unlockedAt: "2026-08-07T08:00:00.000Z" },
  ]);

  assert.deepEqual(receivedOptions, {
    onConflict: "user_id,achievement_id",
    ignoreDuplicates: true,
  });
  assert.equal(achievement.justUnlocked, true);
});
