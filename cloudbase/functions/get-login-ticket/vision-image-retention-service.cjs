const ORPHAN_VISION_DAYS = 14;
const BLOCKED_REVIEWED_DAYS = 7;
const BLOCKED_MAX_DAYS = 30;

function daysAgoIso(days, now = () => new Date()) {
  const ms = Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000;
  return new Date(now().getTime() - ms).toISOString();
}

function createVisionImageRetentionService({
  db,
  deleteFiles,
  now = () => new Date(),
  orphanDays = ORPHAN_VISION_DAYS,
  blockedReviewedDays = BLOCKED_REVIEWED_DAYS,
  blockedMaxDays = BLOCKED_MAX_DAYS,
} = {}) {
  if (!db || typeof db.from !== "function") throw new Error("Vision retention database is unavailable");
  if (typeof deleteFiles !== "function") throw new Error("Vision retention deleteFiles is unavailable");

  async function collectProtectedPaths() {
    const protectedPaths = new Set();
    const meals = await db.from("meal_records").select("image_path").not("image_path", "is", null).limit(5000);
    if (meals?.error) throw new Error("Vision retention meal path read failed");
    for (const row of meals?.data ?? []) {
      if (typeof row.image_path === "string" && row.image_path) protectedPaths.add(row.image_path);
    }
    return protectedPaths;
  }

  async function listBlockedCandidates(limit) {
    const reviewedBefore = daysAgoIso(blockedReviewedDays, now);
    const anyBefore = daysAgoIso(blockedMaxDays, now);
    const result = await db
      .from("content_moderation_flags")
      .select("id,image_path,status,created_at,reviewed_at")
      .eq("source", "vision")
      .not("image_path", "is", null)
      .order("created_at", { ascending: true })
      .limit(Math.min(500, Math.max(1, limit)));
    if (result?.error) throw new Error("Vision retention blocked read failed");
    return (result.data ?? []).filter((row) => {
      if (!row.image_path) return false;
      const created = row.created_at ? new Date(row.created_at).getTime() : 0;
      const reviewed = row.reviewed_at ? new Date(row.reviewed_at).getTime() : 0;
      const maxCut = new Date(anyBefore).getTime();
      const reviewedCut = new Date(reviewedBefore).getTime();
      if (created && created <= maxCut) return true;
      if (row.status !== "open" && reviewed && reviewed <= reviewedCut) return true;
      if (row.status !== "open" && !reviewed && created && created <= reviewedCut) return true;
      return false;
    });
  }

  async function listOrphanAnalyses(limit) {
    const before = daysAgoIso(orphanDays, now);
    const result = await db
      .from("ai_analysis")
      .select("id,image_path,created_at")
      .not("image_path", "is", null)
      .lt("created_at", before)
      .order("created_at", { ascending: true })
      .limit(Math.min(500, Math.max(1, limit)));
    if (result?.error) throw new Error("Vision retention analysis read failed");
    return result.data ?? [];
  }

  return {
    orphanDays,
    blockedReviewedDays,
    blockedMaxDays,

    async purgeExpiredVisionImages({ limit = 200 } = {}) {
      const capped = Math.min(500, Math.max(1, Number(limit) || 200));
      const protectedPaths = await collectProtectedPaths();
      const blocked = await listBlockedCandidates(capped);
      const remaining = Math.max(0, capped - blocked.length);
      const analyses = remaining > 0 ? await listOrphanAnalyses(remaining) : [];

      const toDelete = [];
      const blockedIds = [];
      const analysisIds = [];
      let skippedProtected = 0;

      for (const row of blocked) {
        if (protectedPaths.has(row.image_path)) {
          skippedProtected += 1;
          continue;
        }
        toDelete.push(row.image_path);
        blockedIds.push(row.id);
      }
      for (const row of analyses) {
        if (!row.image_path) continue;
        if (protectedPaths.has(row.image_path)) {
          skippedProtected += 1;
          continue;
        }
        toDelete.push(row.image_path);
        analysisIds.push(row.id);
      }

      const uniquePaths = [...new Set(toDelete.filter(Boolean))];
      let deleted = 0;
      let failed = 0;
      if (uniquePaths.length) {
        try {
          await deleteFiles({ cloudPaths: uniquePaths });
          deleted = uniquePaths.length;
        } catch (error) {
          failed = uniquePaths.length;
          console.error("[vision-retention] deleteFiles failed:", error?.message || error);
        }
      }

      if (failed === 0) {
        for (const id of blockedIds) {
          const updated = await db
            .from("content_moderation_flags")
            .update({ image_path: null })
            .eq("id", id);
          if (updated?.error) console.error("[vision-retention] clear blocked path failed:", updated.error);
        }
        for (const id of analysisIds) {
          const updated = await db
            .from("ai_analysis")
            .update({ image_path: null })
            .eq("id", id);
          if (updated?.error) console.error("[vision-retention] clear analysis path failed:", updated.error);
        }
        if (analysisIds.length) {
          const assets = await db
            .from("uploaded_assets")
            .update({ status: "deleted" })
            .in("object_path", uniquePaths);
          if (assets?.error) {
            // object_path may be cloud:// fileID; best-effort only.
            console.warn("[vision-retention] uploaded_assets mark deleted skipped:", assets.error?.message || assets.error);
          }
        }
      }

      return {
        deleted,
        failed,
        skippedProtected,
        clearedFlags: failed === 0 ? blockedIds.length : 0,
        clearedAnalyses: failed === 0 ? analysisIds.length : 0,
        examined: blocked.length + analyses.length,
      };
    },
  };
}

module.exports = {
  createVisionImageRetentionService,
  ORPHAN_VISION_DAYS,
  BLOCKED_REVIEWED_DAYS,
  BLOCKED_MAX_DAYS,
};
