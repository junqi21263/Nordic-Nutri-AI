const { PublicImageSecurityError } = require("./wechat-image-security.cjs");

function createVisionImageReviewService({
  db,
  resolveTempFileUrls,
  orphanDays = 14,
} = {}) {
  if (!db || typeof db.from !== "function") throw new Error("Vision review database is unavailable");

  async function withTempUrls(items, pathKey = "image_path") {
    const paths = items
      .map((item) => item?.[pathKey])
      .filter((path) => typeof path === "string" && path.length > 0);
    if (!paths.length || typeof resolveTempFileUrls !== "function") {
      return items.map((item) => ({ ...item, imageUrl: null }));
    }
    const urlMap = await resolveTempFileUrls(paths);
    return items.map((item) => ({
      ...item,
      imageUrl: item?.[pathKey] ? (urlMap.get(item[pathKey]) || null) : null,
    }));
  }

  return {
    async listBlocked({ status = "open", limit = 40 } = {}) {
      const capped = Math.min(100, Math.max(1, Number(limit) || 40));
      let query = db
        .from("content_moderation_flags")
        .select("id,user_id,source,snippet,matched_term,status,image_path,created_at,reviewed_at")
        .eq("source", "vision")
        .order("created_at", { ascending: false })
        .limit(capped);
      if (status && status !== "all") query = query.eq("status", status);
      const result = await query;
      if (result?.error) throw new Error("Vision blocked list failed");
      return withTempUrls(result.data ?? []);
    },

    async listAll({ limit = 40, days = orphanDays } = {}) {
      const capped = Math.min(100, Math.max(1, Number(limit) || 40));
      const windowDays = Math.min(60, Math.max(1, Number(days) || orphanDays));
      const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
      const result = await db
        .from("ai_analysis")
        .select("id,user_id,image_path,status,confidence,review_status,provider,model,raw_recognition,created_at")
        .not("image_path", "is", null)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(capped);
      if (result?.error) throw new Error("Vision analysis list failed");
      const rows = (result.data ?? []).map((row) => ({
        id: row.id,
        userId: row.user_id,
        image_path: row.image_path,
        status: row.status,
        confidence: row.confidence,
        reviewStatus: row.review_status || "pending",
        provider: row.provider,
        model: row.model,
        mealName: row.raw_recognition?.mealName || null,
        createdAt: row.created_at,
      }));
      return withTempUrls(rows);
    },

    async updateAnalysisReview(analysisId, reviewStatus) {
      if (!["pending", "reviewed", "flagged"].includes(reviewStatus)) {
        throw new PublicImageSecurityError("VISION_REVIEW_STATUS_INVALID", "审核状态无效");
      }
      const result = await db
        .from("ai_analysis")
        .update({ review_status: reviewStatus })
        .eq("id", analysisId)
        .select("id,review_status,image_path,user_id,created_at")
        .single();
      if (result?.error || !result?.data) throw new Error("Vision analysis review update failed");
      return {
        id: result.data.id,
        reviewStatus: result.data.review_status,
        imagePath: result.data.image_path,
        userId: result.data.user_id,
        createdAt: result.data.created_at,
      };
    },
  };
}

module.exports = {
  createVisionImageReviewService,
};
