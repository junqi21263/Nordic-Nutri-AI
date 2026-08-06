const {
  BANNED_NICKNAME_TERMS,
  findBannedNicknameTerm,
  normalizeNicknameForModeration,
} = require("./nickname-moderation.cjs");
const { shanghaiDayKey, todayShanghaiKey, enumerateDays } = require("./observability-service.cjs");

class PublicContentModerationError extends Error {
  constructor(code, message = "内容包含不当信息，请修改后重试") {
    super(message);
    this.code = code;
  }
}

function findBannedContentTerm(text) {
  return findBannedNicknameTerm(text);
}

function assertTextAllowed(text, { source } = {}) {
  const matchedTerm = findBannedContentTerm(text);
  if (matchedTerm) {
    throw new PublicContentModerationError("CONTENT_BLOCKED", "内容包含不当信息，请修改后重试");
  }
  return { source: source ?? null };
}

function createContentModerationService({ db }) {
  if (!db || typeof db.from !== "function") {
    throw new Error("Content moderation database is unavailable");
  }

  async function loadFlags({ status = "", sinceIso = null, limit = 500 } = {}) {
    const capped = Math.min(1000, Math.max(1, Number(limit) || 500));
    let query = db.from("content_moderation_flags").select("*");
    if (status) query = query.eq("status", status);
    if (sinceIso) query = query.gte("created_at", sinceIso);
    const result = await query
      .order("created_at", { ascending: false })
      .limit(capped);
    if (result?.error) throw new Error("Content moderation flag read failed");
    return result.data ?? [];
  }

  return {
    BANNED_TERMS: BANNED_NICKNAME_TERMS,
    findBannedContentTerm,
    normalizeTextForModeration: normalizeNicknameForModeration,
    assertTextAllowed,

    async flagViolation({ userId = null, source, snippet, matchedTerm, imagePath = null }) {
      const payload = {
        user_id: userId,
        source,
        snippet: String(snippet ?? "").slice(0, 2000),
        matched_term: matchedTerm,
        status: "open",
      };
      if (typeof imagePath === "string" && imagePath) payload.image_path = imagePath.slice(0, 512);
      const result = await db.from("content_moderation_flags").insert(payload).select("*").single();
      if (result?.error) throw new Error("Content moderation flag write failed");
      return result.data;
    },

    async listFlags({ status = "open", limit = 50 } = {}) {
      return loadFlags({ status, limit: Math.min(200, Math.max(1, Number(limit) || 50)) });
    },

    async getDashboard({ days = 14, status = "open", limit = 100 } = {}) {
      const dayKeys = enumerateDays(days);
      const sinceIso = new Date(`${dayKeys[0]}T00:00:00+08:00`).toISOString();
      const [windowFlags, recentFlags, statusSample] = await Promise.all([
        loadFlags({ sinceIso, limit: 1000 }),
        loadFlags({ status: status === "all" ? "" : status, limit }),
        loadFlags({ limit: 1000 }),
      ]);

      const statusCounts = { open: 0, reviewed: 0, dismissed: 0 };
      for (const row of statusSample) {
        if (Object.prototype.hasOwnProperty.call(statusCounts, row.status)) {
          statusCounts[row.status] += 1;
        }
      }

      const sourceCounts = {};
      const termCounts = {};
      const seriesMap = Object.fromEntries(dayKeys.map((key) => [key, 0]));
      const today = todayShanghaiKey();
      let todayCount = 0;

      for (const row of windowFlags) {
        const key = shanghaiDayKey(row.created_at || row.createdAt);
        if (key && key in seriesMap) seriesMap[key] += 1;
        if (key === today) todayCount += 1;
        const source = row.source || "unknown";
        sourceCounts[source] = (sourceCounts[source] || 0) + 1;
        const term = row.matched_term || row.matchedTerm;
        if (term) termCounts[term] = (termCounts[term] || 0) + 1;
      }

      const bySource = Object.entries(sourceCounts)
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count);
      const topTerms = Object.entries(termCounts)
        .map(([term, count]) => ({ term, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 12);

      return {
        days: dayKeys.length,
        today,
        timezone: "Asia/Shanghai",
        summary: {
          open: statusCounts.open,
          reviewed: statusCounts.reviewed,
          dismissed: statusCounts.dismissed,
          total: statusCounts.open + statusCounts.reviewed + statusCounts.dismissed,
          today: todayCount,
          windowTotal: windowFlags.length,
        },
        bySource,
        topTerms,
        series: dayKeys.map((date) => ({ date, value: seriesMap[date] })),
        bannedTermCount: BANNED_NICKNAME_TERMS.length,
        coverage: [
          { source: "feedback", label: "问题反馈" },
          { source: "coach", label: "营养教练对话" },
          { source: "nickname", label: "昵称" },
          { source: "vision", label: "拍照识别" },
        ],
        items: recentFlags,
      };
    },

    async updateFlagStatus(id, status) {
      if (!["open", "reviewed", "dismissed"].includes(status)) {
        throw new PublicContentModerationError("CONTENT_MODERATION_STATUS_INVALID", "审核状态无效");
      }
      const reviewedAt = status === "open" ? null : new Date().toISOString();
      const result = await db
        .from("content_moderation_flags")
        .update({ status, reviewed_at: reviewedAt })
        .eq("id", id)
        .select("*")
        .single();
      if (result?.error || !result?.data) throw new Error("Content moderation flag update failed");
      return result.data;
    },
  };
}

module.exports = {
  PublicContentModerationError,
  assertTextAllowed,
  createContentModerationService,
};
