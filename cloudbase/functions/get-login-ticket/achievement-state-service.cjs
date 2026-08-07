function timestamp(value, fallback) {
  if (typeof value === "string" && !Number.isNaN(new Date(value).getTime())) return value;
  return fallback().toISOString();
}

function createAchievementStateService({ db, clock = () => new Date() }) {
  if (!db || typeof db.from !== "function") throw new Error("Achievement state database is unavailable");

  return {
    async reconcile(userId, achievements) {
      const existingResult = await db
        .from("user_achievements")
        .select("achievement_id,completed_at")
        .eq("user_id", userId);
      if (existingResult.error) throw new Error("Achievement state read failed");

      const completedById = new Map(
        (existingResult.data || []).map((row) => [row.achievement_id, row.completed_at]),
      );
      const newlyCompleted = achievements
        .filter((achievement) => achievement.unlocked && !completedById.has(achievement.id))
        .map((achievement) => ({
          user_id: userId,
          achievement_id: achievement.id,
          completed_at: timestamp(achievement.unlockedAt, clock),
        }));

      if (newlyCompleted.length) {
        const inserted = await db.from("user_achievements").insert(newlyCompleted);
        if (inserted.error) throw new Error("Achievement state save failed");
        newlyCompleted.forEach((row) => completedById.set(row.achievement_id, row.completed_at));
      }

      return achievements.map((achievement) => {
        const completedAt = completedById.get(achievement.id);
        return completedAt
          ? { ...achievement, unlocked: true, progress: 100, unlockedAt: completedAt }
          : achievement;
      });
    },
  };
}

module.exports = { createAchievementStateService };
