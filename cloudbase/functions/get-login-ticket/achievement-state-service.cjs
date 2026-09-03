const { withDbReadRetry } = require("./db-read-retry.cjs");

function timestamp(value, fallback) {
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) return value;
  return fallback().toISOString();
}

function createAchievementStateService({ db, clock = () => new Date() }) {
  if (!db || typeof db.from !== "function") throw new Error("Achievement state database is unavailable");

  return {
    async reconcile(userId, achievements) {
      const existingResult = await withDbReadRetry(() => db
        .from("user_achievements")
        .select("achievement_id,completed_at,celebrated_at")
        .eq("user_id", userId));
      if (existingResult.error) throw new Error("Achievement state read failed");

      const completedById = new Map(
        (existingResult.data || []).map((row) => [row.achievement_id, row]),
      );
      const newlyCompleted = achievements
        .filter((achievement) => achievement.unlocked && !completedById.has(achievement.id))
        .map((achievement) => ({
          user_id: userId,
          achievement_id: achievement.id,
          completed_at: timestamp(achievement.unlockedAt, clock),
        }));
      const justUnlockedIds = new Set(newlyCompleted.map((row) => row.achievement_id));

      if (newlyCompleted.length) {
        // A profile save and the app bootstrap can evaluate achievements at the
        // same time. The unique user/achievement key makes this write idempotent
        // instead of losing the response (and its unlock event) to a conflict.
        const inserted = await db.from("user_achievements").upsert(newlyCompleted, {
          onConflict: "user_id,achievement_id",
          ignoreDuplicates: true,
        });
        if (inserted.error) throw new Error("Achievement state save failed");
        newlyCompleted.forEach((row) => completedById.set(row.achievement_id, row));
      }

      return achievements.map((achievement) => {
        const completion = completedById.get(achievement.id);
        return completion
          ? {
            ...achievement,
            unlocked: true,
            progress: 100,
            unlockedAt: completion.completed_at,
            justUnlocked: justUnlockedIds.has(achievement.id),
            celebrationPending: !completion.celebrated_at,
          }
          : { ...achievement, justUnlocked: false, celebrationPending: false };
      });
    },
    async acknowledgeCelebration(userId, achievementId) {
      const result = await db
        .from("user_achievements")
        .update({ celebrated_at: clock().toISOString() })
        .eq("user_id", userId)
        .eq("achievement_id", achievementId)
        .is("celebrated_at", null);
      if (result.error) throw new Error("Achievement celebration acknowledgement failed");
    },
  };
}

module.exports = { createAchievementStateService };
