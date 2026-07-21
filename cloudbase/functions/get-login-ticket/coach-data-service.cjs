const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

class PublicCoachDataError extends Error {
  constructor(code, message = "教练消息无效") {
    super(message);
    this.code = code;
  }
}

function normalizeInput(input) {
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt || prompt.length > 1000) throw new PublicCoachDataError("COACH_INPUT_INVALID");
  if (typeof input?.clientRequestId !== "string" || !uuidPattern.test(input.clientRequestId)) throw new PublicCoachDataError("COACH_INPUT_INVALID");
  if (typeof input?.date !== "string" || !datePattern.test(input.date)) throw new PublicCoachDataError("COACH_INPUT_INVALID");
  return { prompt, clientRequestId: input.clientRequestId, date: input.date };
}

function mapMessage(row) {
  return {
    id: row.id,
    role: row.role,
    content: row.content ?? "",
    provider: row.provider ?? null,
    model: row.model ?? null,
    createdAt: row.created_at,
  };
}

function ruleReply(prompt, summary) {
  const protein = Math.max(0, Math.round(Number(summary?.remaining?.protein ?? 0)));
  const calories = Math.max(0, Math.round(Number(summary?.remaining?.calories ?? 0)));
  if (prompt.includes("进度")) return `今天还可摄入约 ${calories} kcal，距离目标还差 ${protein}g 蛋白质。下一餐优先安排瘦肉、鸡蛋、豆腐或高蛋白酸奶。`;
  if (prompt.includes("蛋白")) return `今天还差约 ${protein}g 蛋白质。可以分到接下来的一至两餐补充，优先选择鸡胸肉、鱼、鸡蛋、豆腐或无糖高蛋白酸奶。`;
  return `结合今天的记录，下一餐建议包含一掌心优质蛋白、半盘蔬菜和适量主食；目前还差约 ${protein}g 蛋白质。`;
}

function createCoachDataService({ db, getDailySummary, answer, model = "deepseek-v4-flash" }) {
  if (!db || typeof db.from !== "function" || typeof getDailySummary !== "function") throw new Error("Coach dependencies are unavailable");

  async function getConversation(userId) {
    const current = await db.from("coach_conversations").select("id").eq("user_id", userId).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (current.error) throw new Error("Coach conversation read failed");
    if (current.data?.id) return current.data.id;
    const created = await db.from("coach_conversations").insert({ user_id: userId, title: "营养教练" }).select("id").single();
    if (created.error || !created.data?.id) throw new Error("Coach conversation creation failed");
    return created.data.id;
  }

  async function getMessages(userId, limit = 30) {
    const conversationId = await getConversation(userId);
    const result = await db.from("coach_messages").select("*").eq("user_id", userId).eq("conversation_id", conversationId)
      .order("created_at", { ascending: true }).limit(Math.min(50, Math.max(1, limit)));
    if (result.error) throw new Error("Coach messages read failed");
    return (result.data ?? []).map(mapMessage);
  }

  async function sendMessage(userId, input) {
    const request = normalizeInput(input);
    const conversationId = await getConversation(userId);
    const prior = await db.from("coach_messages").select("id").eq("user_id", userId).eq("client_request_id", request.clientRequestId).maybeSingle();
    if (prior.error) throw new Error("Coach request lookup failed");
    if (prior.data?.id) return { conversationId, messages: await getMessages(userId) };

    const userMessage = await db.from("coach_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "user",
      content: request.prompt,
      context_date: request.date,
      client_request_id: request.clientRequestId,
    }).select("*").single();
    if (userMessage.error || !userMessage.data) throw new Error("Coach message save failed");

    const [summary, history] = await Promise.all([getDailySummary(userId, request.date), getMessages(userId, 10)]);
    let provider = "rule_v1";
    let content = ruleReply(request.prompt, summary);
    if (typeof answer === "function") {
      try {
        content = await answer({ prompt: request.prompt, context: summary, history });
        provider = "deepseek";
      } catch {
        // Keep a safe, deterministic answer when the optional model is unavailable.
      }
    }
    const assistantMessage = await db.from("coach_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "assistant",
      content,
      context_date: request.date,
      context_snapshot: summary,
      answer: { content },
      provider,
      model: provider === "deepseek" ? model : "rule_v1",
    }).select("*").single();
    if (assistantMessage.error || !assistantMessage.data) throw new Error("Coach answer save failed");
    return { conversationId, messages: [mapMessage(userMessage.data), mapMessage(assistantMessage.data)] };
  }

  return { getMessages, sendMessage };
}

module.exports = { createCoachDataService, PublicCoachDataError };
