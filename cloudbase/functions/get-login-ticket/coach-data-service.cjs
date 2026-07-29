const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const medicalRiskPattern = /疾病|诊断|治疗|药物|吃药|处方|孕产|怀孕|哺乳|未成年|进食障碍|厌食|暴食/i;
const urgentRiskPattern = /自杀|昏厥|胸痛|呼吸困难|严重过敏|急诊|急救/i;
const nutritionScopePattern = /营养|饮食|食谱|食物|吃|喝|餐|蛋白|热量|卡路里|碳水|脂肪|纤维|蔬菜|水果|主食|食材|加餐|早餐|午餐|晚餐|增肌|减脂|体重|饱腹|恢复|训练|运动|今日进度/i;
const unsafeStreamTextPattern = /诊断|治疗|处方|药物|用药|孕期|怀孕|哺乳|厌食|暴食/i;

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

function normalizeDate(date) {
  if (typeof date !== "string" || !datePattern.test(date)) throw new PublicCoachDataError("COACH_INPUT_INVALID");
  return date;
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

function safeNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function createContext(daily, weekly, account) {
  return {
    goalType: account?.goalType ?? null,
    daily: {
      targets: daily?.targets ?? {},
      consumed: daily?.consumed ?? {},
      remaining: daily?.remaining ?? {},
      completion: safeNumber(daily?.completion),
      mealCount: Array.isArray(daily?.meals) ? daily.meals.length : 0,
    },
    weekly: {
      recordedDays: safeNumber(weekly?.recordedDays),
      proteinCompletion: safeNumber(weekly?.proteinCompletion),
      score: safeNumber(weekly?.score),
    },
    preferences: {
      dietaryPattern: account?.settings?.dietaryPattern ?? null,
      foodAvoidances: Array.isArray(account?.settings?.foodAvoidances) ? account.settings.foodAvoidances.slice(0, 20) : [],
    },
  };
}

function safetyForPrompt(prompt) {
  if (urgentRiskPattern.test(prompt)) return "urgent_care";
  if (medicalRiskPattern.test(prompt)) return "professional_consultation";
  return "none";
}

function isNutritionQuestion(prompt) {
  return nutritionScopePattern.test(prompt);
}

function priorityForContext(context) {
  const remaining = context.daily.remaining;
  if (!context.daily.mealCount) return "logging";
  if (safeNumber(remaining.protein) >= 20) return "protein";
  if (safeNumber(remaining.calories) >= 300) return "calories";
  if (safeNumber(remaining.carbs) >= 40) return "carbs";
  if (safeNumber(remaining.fat) >= 15) return "fat";
  return "regularity";
}

function quickPromptsForContext(context) {
  const priority = priorityForContext(context);
  const protein = safeNumber(context.daily.remaining.protein);
  const calories = safeNumber(context.daily.remaining.calories);
  if (priority === "logging") {
    return ["我想补记今天的一餐", "这餐怎么记录更准确？", "今天还差哪些营养？", "下一餐怎么搭配？"];
  }
  if (priority === "protein") {
    return [
      `晚餐怎么补${protein}g 蛋白？`,
      "适合的高蛋白加餐？",
      "外食怎么补足蛋白？",
      "今天其余营养怎么搭配？",
    ];
  }
  if (priority === "calories") {
    return [
      `还剩${calories} kcal，下一餐怎么吃？`,
      "加餐怎么安排更合适？",
      "外食怎么选更均衡？",
      "查看今天的营养进度",
    ];
  }
  return ["下一餐怎么搭配？", "适合什么健康加餐？", "外食怎么选更均衡？", "查看今天的营养进度"];
}

function createRuleReply(prompt, context) {
  const safety = safetyForPrompt(prompt);
  if (safety !== "none") {
    const urgent = safety === "urgent_care";
    return {
      priority: "regularity",
      headline: urgent ? "请优先获得及时医疗帮助" : "请先咨询合适的专业人员",
      actions: [{ label: "安全优先", detail: urgent ? "如有紧急或严重不适，请尽快联系急救服务或就近医疗机构。" : "涉及疾病、药物或特殊生理阶段时，请向医生或注册营养专业人士确认。" }],
      rationale: "为了避免给出不适合个人情况的饮食建议，需要专业人员结合你的具体健康信息判断。",
      safety,
    };
  }

  if (!isNutritionQuestion(prompt)) {
    return {
      priority: "regularity",
      headline: "我只提供日常营养建议",
      actions: [{ label: "可以这样问", detail: "请咨询营养、饮食、食谱或训练恢复相关问题，例如：晚餐怎么补蛋白？" }],
      rationale: "为了让建议保持准确、安全和可执行，我不会回答与日常营养无关的话题。",
      safety: "none",
    };
  }

  const protein = safeNumber(context.daily.remaining.protein);
  const calories = safeNumber(context.daily.remaining.calories);
  const priority = priorityForContext(context);
  if (priority === "logging") {
    return {
      priority,
      headline: "先记录一餐，再做更准调整",
      actions: [{ label: "记录", detail: "先补记今天已吃的一餐或加餐，包含份量和主要食材。" }],
      rationale: "记录不足时不适合推测热量或营养缺口，先有真实记录再调整更稳妥。",
      safety: "none",
    };
  }
  if (priority === "protein") {
    return {
      priority,
      headline: "下一餐优先补充优质蛋白",
      actions: [
        { label: "主菜", detail: `安排一掌心鸡胸肉、鱼、鸡蛋或豆腐，约补足 ${protein}g 蛋白质缺口的一部分。` },
        { label: "搭配", detail: "同时配半盘蔬菜和适量主食，避免只靠零食补蛋白。" },
      ],
      rationale: `今天还差约 ${protein}g 蛋白质；分到接下来一至两餐补充更容易执行。`,
      safety: "none",
    };
  }
  return {
    priority,
    headline: "下一餐保持均衡、按饥饿感进食",
    actions: [{ label: "组合", detail: "选择一份优质蛋白、半盘蔬菜和适量主食，餐后观察饱腹感。" }],
    rationale: `今天仍有约 ${calories} kcal 的可安排空间，规律进餐比临时大幅调整更重要。`,
    safety: "none",
  };
}

function formatContent(reply) {
  const actions = reply.actions.map((action, index) => `${index + 1}. ${action.label}：${action.detail}`).join("\n");
  const safety = reply.safety === "none" ? "" : "\n如有不适或特殊健康情况，请咨询合适的专业人员。";
  return `${reply.headline}\n${actions}\n原因：${reply.rationale}${safety}`.slice(0, 500);
}

function addReplyMetadata(reply, source, model) {
  return { ...reply, source, model: source === "deepseek" ? model : null };
}

function validateStreamedText(value) {
  const content = typeof value === "string" ? value.trim() : "";
  if (!content || content.length > 500 || unsafeStreamTextPattern.test(content)) {
    throw new PublicCoachDataError("COACH_STREAM_INVALID");
  }
  return content;
}

function takeCompleteSentences(value) {
  const match = /^(.*[。！？\n])/.exec(value);
  return match ? { text: match[1], rest: value.slice(match[1].length) } : { text: "", rest: value };
}

function createCoachDataService({ db, getDailySummary, getWeeklyReview, getAccount, answer, streamAnswer, dailyTip, model = "deepseek-v4-flash" }) {
  if (!db || typeof db.from !== "function" || typeof getDailySummary !== "function" || typeof getWeeklyReview !== "function" || typeof getAccount !== "function") {
    throw new Error("Coach dependencies are unavailable");
  }

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

  async function restartConversation(userId) {
    const current = await db.from("coach_conversations").select("id").eq("user_id", userId).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (current.error) throw new Error("Coach conversation read failed");
    if (current.data?.id) {
      const archived = await db.from("coach_conversations").update({ archived_at: new Date().toISOString() })
        .eq("id", current.data.id).eq("user_id", userId).is("archived_at", null);
      if (archived.error) throw new Error("Coach conversation archive failed");
    }
    const created = await db.from("coach_conversations").insert({ user_id: userId, title: "营养教练" }).select("id").single();
    if (created.error || !created.data?.id) throw new Error("Coach conversation creation failed");
    return { conversationId: created.data.id, messages: [] };
  }

  async function buildContext(userId, date) {
    const [daily, weekly, account] = await Promise.all([
      getDailySummary(userId, date),
      getWeeklyReview(userId, date),
      getAccount(userId),
    ]);
    return createContext(daily, weekly, account);
  }

  async function getPriorReply(userId, clientRequestId) {
    const prior = await db.from("coach_messages").select("*").eq("user_id", userId).eq("client_request_id", clientRequestId).maybeSingle();
    if (prior.error) throw new Error("Coach request lookup failed");
    if (!prior.data?.id) return null;
    const assistant = await db.from("coach_messages").select("*").eq("user_id", userId).eq("conversation_id", prior.data.conversation_id)
      .eq("role", "assistant").order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (assistant.error || !assistant.data?.answer || typeof assistant.data.answer !== "object") throw new Error("Coach prior reply unavailable");
    return { conversationId: prior.data.conversation_id, reply: assistant.data.answer };
  }

  async function createUserMessage(userId, conversationId, request) {
    const userMessage = await db.from("coach_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "user",
      content: request.prompt,
      context_date: request.date,
      client_request_id: request.clientRequestId,
    }).select("*").single();
    if (userMessage.error || !userMessage.data) throw new Error("Coach message save failed");
    return userMessage.data;
  }

  async function persistResponse({ userId, conversationId, userMessage, request, context, reply, source, content }) {
    const persistedReply = addReplyMetadata(reply, source, model);
    const assistantMessage = await db.from("coach_messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role: "assistant",
      content: content ?? formatContent(reply),
      context_date: request.date,
      context_snapshot: context,
      answer: persistedReply,
      provider: source,
      model: source === "deepseek" ? model : "rule_v2",
    }).select("*").single();
    if (assistantMessage.error || !assistantMessage.data) throw new Error("Coach answer save failed");
    return { conversationId, messages: [mapMessage(userMessage), mapMessage(assistantMessage.data)], reply: persistedReply };
  }

  async function sendMessage(userId, input) {
    const request = normalizeInput(input);
    const prior = await getPriorReply(userId, request.clientRequestId);
    if (prior) return { conversationId: prior.conversationId, messages: await getMessages(userId), reply: prior.reply };

    const conversationId = await getConversation(userId);
    const userMessage = await createUserMessage(userId, conversationId, request);

    const [context, history] = await Promise.all([buildContext(userId, request.date), getMessages(userId, 10)]);
    let source = "rule_v2";
    let reply = createRuleReply(request.prompt, context);
    if (reply.safety === "none" && isNutritionQuestion(request.prompt) && typeof answer === "function") {
      try {
        reply = await answer({ prompt: request.prompt, context, history });
        source = "deepseek";
      } catch {
        // The deterministic reply remains available if the optional provider is unavailable.
      }
    }
    return persistResponse({ userId, conversationId, userMessage, request, context, reply, source });
  }

  async function* streamMessage(userId, input) {
    const request = normalizeInput(input);
    const prior = await getPriorReply(userId, request.clientRequestId);
    if (prior) {
      yield { type: "complete", conversationId: prior.conversationId, messages: await getMessages(userId), reply: prior.reply };
      return;
    }

    const conversationId = await getConversation(userId);
    const userMessage = await createUserMessage(userId, conversationId, request);
    const [context, history] = await Promise.all([buildContext(userId, request.date), getMessages(userId, 10)]);
    const fallback = createRuleReply(request.prompt, context);
    if (fallback.safety !== "none" || !isNutritionQuestion(request.prompt) || typeof streamAnswer !== "function") {
      yield { type: "complete", ...await persistResponse({ userId, conversationId, userMessage, request, context, reply: fallback, source: "rule_v2" }) };
      return;
    }

    let content = "";
    let pending = "";
    try {
      for await (const chunk of streamAnswer({ prompt: request.prompt, context, history })) {
        pending += chunk;
        const sentence = takeCompleteSentences(pending);
        pending = sentence.rest;
        if (sentence.text) {
          content += sentence.text;
          validateStreamedText(content);
          yield { type: "delta", text: sentence.text };
        }
      }
      content += pending;
      content = validateStreamedText(content);
      if (pending) yield { type: "delta", text: pending };
      const result = await persistResponse({
        userId,
        conversationId,
        userMessage,
        request,
        context,
        reply: fallback,
        source: "deepseek",
        content,
      });
      yield { type: "complete", ...result };
    } catch {
      yield { type: "complete", ...await persistResponse({ userId, conversationId, userMessage, request, context, reply: fallback, source: "rule_v2" }) };
    }
  }

  async function getBrief(userId, date) {
    const safeDate = normalizeDate(date);
    const context = await buildContext(userId, safeDate);
    const priority = priorityForContext(context);
    return {
      date: safeDate,
      priority,
      remaining: context.daily.remaining,
      completion: context.daily.completion,
      quickPrompts: quickPromptsForContext(context),
    };
  }

  async function getDailyTip(userId, date) {
    const safeDate = normalizeDate(date);
    const context = await buildContext(userId, safeDate);
    if (typeof dailyTip === "function") return dailyTip({ date: safeDate, context });
    return {
      type: "nutrition_tip",
      headline: "下一餐保持均衡",
      content: "选择一份优质蛋白、半盘蔬菜和适量主食，让今天的饮食更完整。",
      food: null,
      source: "rule_v2",
      model: null,
    };
  }

  return { getMessages, sendMessage, streamMessage, getBrief, restartConversation, getDailyTip };
}

module.exports = { PublicCoachDataError, createCoachDataService };
