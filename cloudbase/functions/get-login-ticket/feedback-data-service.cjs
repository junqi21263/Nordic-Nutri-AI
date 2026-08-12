const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories = new Set(["product", "bug", "feature", "support"]);

class PublicFeedbackError extends Error {
  constructor(code = "FEEDBACK_INVALID", message = "反馈无效") {
    super(message);
    this.code = code;
  }
}

function normalizeFeedback(input) {
  const content = typeof input?.content === "string" ? input.content.trim() : "";
  const category = typeof input?.category === "string" ? input.category : "product";
  if (!content || content.length > 2000 || !categories.has(category)) throw new PublicFeedbackError();
  if (typeof input?.clientRequestId !== "string" || !uuidPattern.test(input.clientRequestId)) throw new PublicFeedbackError();
  const deviceContext = input?.deviceContext && typeof input.deviceContext === "object" && !Array.isArray(input.deviceContext)
    ? input.deviceContext
    : {};
  return { content, category, clientRequestId: input.clientRequestId, deviceContext };
}

function normalizeFeedbackIds(input) {
  if (!Array.isArray(input) || input.length > 50) throw new PublicFeedbackError();
  const ids = [...new Set(input)];
  if (ids.some((id) => typeof id !== "string" || !uuidPattern.test(id))) throw new PublicFeedbackError();
  return ids;
}

function mapFeedback(row) {
  return {
    id: row.id,
    category: row.category,
    content: row.content,
    status: row.status,
    adminReply: row.admin_reply ?? null,
    createdAt: row.created_at,
    repliedAt: row.replied_at ?? null,
    replyReadAt: row.reply_read_at ?? null,
  };
}

function createFeedbackDataService({ db }) {
  if (!db || typeof db.from !== "function") throw new Error("Feedback database is unavailable");
  return {
    async submitFeedback(userId, input) {
      const feedback = normalizeFeedback(input);
      const result = await db.from("user_feedback").insert({
        user_id: userId,
        category: feedback.category,
        content: feedback.content,
        client_request_id: feedback.clientRequestId,
        device_context: feedback.deviceContext,
      }).select("id,category,created_at").single();
      if (result.error || !result.data?.id) throw new Error("Feedback save failed");
      return { id: result.data.id, category: result.data.category, createdAt: result.data.created_at };
    },

    async listFeedbackForUser(userId, { limit = 30 } = {}) {
      const cap = Math.min(Math.max(Number(limit) || 30, 1), 50);
      const result = await db
        .from("user_feedback")
        .select("id,category,content,status,admin_reply,created_at,replied_at,reply_read_at")
        .eq("user_id", userId)
        .not("admin_reply", "is", null)
        .order("created_at", { ascending: false })
        .limit(cap);
      if (result.error) throw new Error("Feedback list failed");
      const items = (result.data || []).map(mapFeedback);
      return {
        items,
        unreadReplyCount: items.filter((item) => item.adminReply && !item.replyReadAt).length,
      };
    },

    async markRepliesRead(userId, feedbackIds) {
      const ids = normalizeFeedbackIds(feedbackIds);
      if (!ids.length) return { markedCount: 0 };
      const result = await db
        .from("user_feedback")
        .update({ reply_read_at: new Date().toISOString() })
        .eq("user_id", userId)
        .in("id", ids)
        .not("admin_reply", "is", null)
        .is("reply_read_at", null)
        .select("id");
      if (result.error) throw new Error("Feedback read update failed");
      return { markedCount: (result.data || []).length };
    },
  };
}

module.exports = { createFeedbackDataService, PublicFeedbackError };
