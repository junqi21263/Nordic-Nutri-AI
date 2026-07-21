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
  };
}

module.exports = { createFeedbackDataService, PublicFeedbackError };
