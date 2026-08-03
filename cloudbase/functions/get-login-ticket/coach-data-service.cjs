const crypto = require("node:crypto");
const {
  dietaryPatternLabel,
  foodAvoidanceLabels,
} = require("./diet-preference-labels.cjs");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const medicalRiskPattern = /疾病|诊断|治疗|药物|吃药|处方|孕产|怀孕|哺乳|未成年|进食障碍|厌食|暴食/i;
const urgentRiskPattern = /自杀|昏厥|胸痛|呼吸困难|严重过敏|急诊|急救/i;
const nutritionScopePattern = /营养|饮食|食谱|食物|吃|喝|餐|蛋白|热量|卡路里|碳水|脂肪|纤维|蔬菜|水果|主食|食材|加餐|早餐|午餐|晚餐|增肌|减脂|体重|饱腹|恢复|训练|运动|今日进度/i;
const unsafeStreamTextPattern = /诊断|治疗|处方|药物|用药|孕期|怀孕|哺乳|厌食|暴食/i;
const streamPresentationPattern = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;

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

function normalizeMealsPerDay(value) {
  const meals = Number(value);
  return Number.isFinite(meals) && meals >= 2 && meals <= 5 ? Math.round(meals) : 3;
}

function createContext(daily, weekly, account) {
  const dietaryPattern = account?.settings?.dietaryPattern ?? null;
  const foodAvoidances = Array.isArray(account?.settings?.foodAvoidances)
    ? account.settings.foodAvoidances.slice(0, 20)
    : [];
  const mealsPerDay = normalizeMealsPerDay(account?.settings?.mealsPerDay);
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
      dietaryPattern,
      dietaryPatternLabel: dietaryPatternLabel(dietaryPattern),
      foodAvoidances,
      foodAvoidanceLabels: foodAvoidanceLabels(foodAvoidances),
      mealsPerDay,
    },
  };
}

/** Protein-forward foods filtered by pattern + avoidances for rule replies. */
function proteinFoodSuggestions(preferences) {
  const avoid = new Set(preferences?.foodAvoidances || []);
  const pattern = preferences?.dietaryPattern || "none";
  const pool = [];
  if (pattern === "vegan") {
    pool.push("豆腐", "豆干", "豆浆", "毛豆");
  } else if (pattern === "vegetarian") {
    pool.push("鸡蛋", "豆腐", "希腊酸奶", "奶制品");
  } else if (pattern === "pescatarian") {
    pool.push("鱼肉", "虾仁", "鸡蛋", "豆腐");
  } else if (pattern === "halal") {
    pool.push("鸡胸肉", "鱼肉", "鸡蛋", "豆腐");
  } else {
    pool.push("鸡胸肉", "鱼肉", "鸡蛋", "豆腐");
  }

  const blockedByToken = [
    { codes: ["eggs"], tokens: ["鸡蛋", "蛋"] },
    { codes: ["seafood"], tokens: ["鱼", "虾", "海鲜"] },
    { codes: ["dairy"], tokens: ["奶", "酸奶", "奶酪"] },
    { codes: ["soy"], tokens: ["豆腐", "豆干", "豆浆", "毛豆", "大豆"] },
    { codes: ["beef"], tokens: ["牛肉"] },
    { codes: ["pork"], tokens: ["猪肉"] },
    { codes: ["nuts"], tokens: ["坚果"] },
  ];
  const blockedTokens = blockedByToken
    .filter((rule) => rule.codes.some((code) => avoid.has(code)))
    .flatMap((rule) => rule.tokens);

  const filtered = pool.filter(
    (food) => !blockedTokens.some((token) => food.includes(token)),
  );
  if (filtered.length >= 2) return filtered.slice(0, 3);
  if (filtered.length === 1) return [...filtered, "豆类或植物蛋白"];
  return ["豆腐或豆类蛋白", "适量主食与蔬菜"];
}

function tipContextHash(context) {
  return crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

function safetyForPrompt(prompt) {
  if (urgentRiskPattern.test(prompt)) return "urgent_care";
  if (medicalRiskPattern.test(prompt)) return "professional_consultation";
  return "none";
}

function isNutritionQuestion(prompt) {
  return nutritionScopePattern.test(prompt);
}

function isMissingAppUserError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "");
  return code === "DATABASE_23503" || /foreign key constraint .*coach_conversations_user_id_fkey/i.test(message);
}

function throwConversationCreateError(error) {
  if (isMissingAppUserError(error)) {
    throw new PublicCoachDataError("SESSION_USER_MISSING", "登录已失效，请重新登录");
  }
  const detail = typeof error?.message === "string" && error.message.trim() ? error.message.trim() : "";
  throw new Error(detail ? `Coach conversation creation failed: ${detail}` : "Coach conversation creation failed");
}

function priorityForContext(context) {
  const remaining = context?.daily?.remaining ?? {};
  if (!context?.daily?.mealCount) return "logging";
  if (safeNumber(remaining.protein) >= 20) return "protein";
  if (safeNumber(remaining.calories) >= 300) return "calories";
  if (safeNumber(remaining.carbs) >= 40) return "carbs";
  if (safeNumber(remaining.fat) >= 15) return "fat";
  return "regularity";
}

const dietPatternCodes = new Set([
  "vegetarian",
  "vegan",
  "pescatarian",
  "low_carb",
  "keto",
  "mediterranean",
  "halal",
]);

function preferenceQuickPrompts(context) {
  const pattern = context.preferences?.dietaryPattern;
  const patternLabel = context.preferences?.dietaryPatternLabel;
  const avoidanceLabels = context.preferences?.foodAvoidanceLabels || [];
  const mealsPerDay = normalizeMealsPerDay(context.preferences?.mealsPerDay);
  const prompts = [];
  if (dietPatternCodes.has(pattern) && patternLabel) {
    prompts.push(`${patternLabel}下一餐怎么搭？`);
    prompts.push(`${patternLabel}怎么补蛋白？`);
  }
  if (avoidanceLabels[0]) {
    prompts.push(`避开${avoidanceLabels[0]}吃什么？`);
  }
  if (mealsPerDay !== 3) {
    prompts.push(`每天${mealsPerDay}餐怎么分配？`);
  }
  if (avoidanceLabels[0]) {
    prompts.push(`外食怎么避开${avoidanceLabels[0]}？`);
    prompts.push("忌口加餐怎么安排？");
  }
  if (avoidanceLabels[1]) {
    prompts.push(`也避开${avoidanceLabels[1]}怎么吃？`);
  }
  return prompts;
}

function mergeQuickPrompts(preferred, fallback, limit = 4) {
  const seen = new Set();
  const merged = [];
  for (const prompt of [...preferred, ...fallback]) {
    if (!prompt || seen.has(prompt)) continue;
    seen.add(prompt);
    merged.push(prompt);
    if (merged.length >= limit) break;
  }
  return merged;
}

function quickPromptsForContext(context) {
  const priority = priorityForContext(context);
  const remaining = context?.daily?.remaining ?? {};
  const protein = safeNumber(remaining.protein);
  const calories = safeNumber(remaining.calories);
  const avoidanceLabels = context.preferences?.foodAvoidanceLabels || [];
  const avoidHint = avoidanceLabels[0] ? `避开${avoidanceLabels[0]}` : null;
  const mealsPerDay = normalizeMealsPerDay(context.preferences?.mealsPerDay);
  const preferred = preferenceQuickPrompts(context);
  let fallback;
  if (priority === "logging") {
    fallback = [
      "我想补记今天的一餐",
      "这餐怎么记录更准确？",
      "今天还差哪些营养？",
      "下一餐怎么搭配？",
    ];
  } else if (priority === "protein") {
    fallback = [
      `晚餐怎么补${protein}g 蛋白？`,
      avoidHint ? `${avoidHint}怎么补蛋白？` : "适合的高蛋白加餐？",
      "外食怎么补足蛋白？",
      mealsPerDay <= 2 ? "两餐制怎么安排蛋白？" : "今天其余营养怎么搭配？",
    ];
  } else if (priority === "calories") {
    fallback = [
      `还剩${calories} kcal，下一餐怎么吃？`,
      mealsPerDay >= 4 ? "加餐怎么安排更合适？" : "下一餐怎么分配热量？",
      avoidHint ? `外食${avoidHint}怎么选？` : "外食怎么选更均衡？",
      "查看今天的营养进度",
    ];
  } else {
    fallback = [
      "下一餐怎么搭配？",
      avoidHint ? `${avoidHint}适合吃什么？` : "适合什么健康加餐？",
      "外食怎么选更均衡？",
      "查看今天的营养进度",
    ];
  }
  return mergeQuickPrompts(preferred, fallback);
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

  const remaining = context?.daily?.remaining ?? {};
  const protein = safeNumber(remaining.protein);
  const calories = safeNumber(remaining.calories);
  const priority = priorityForContext(context);
  const foods = proteinFoodSuggestions(context.preferences);
  const foodList = foods.join("、");
  const avoidanceLabels = context.preferences?.foodAvoidanceLabels || [];
  const avoidNote = avoidanceLabels.length
    ? `按你的忌口（${avoidanceLabels.slice(0, 2).join("、")}）`
    : "按你的饮食偏好";
  const mealsPerDay = normalizeMealsPerDay(context.preferences?.mealsPerDay);
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
        {
          label: "主菜",
          detail: `${avoidNote}，安排一掌心${foodList}，约补足 ${protein}g 蛋白质缺口的一部分。`,
        },
        {
          label: "搭配",
          detail:
            mealsPerDay >= 4
              ? "可拆到正餐与加餐，同时配半盘蔬菜和适量主食。"
              : "同时配半盘蔬菜和适量主食，避免只靠零食补蛋白。",
        },
      ],
      rationale: `今天还差约 ${protein}g 蛋白质；按每日 ${mealsPerDay} 餐分摊补充更容易执行。`,
      safety: "none",
    };
  }
  return {
    priority,
    headline: "下一餐保持均衡、按饥饿感进食",
    actions: [
      {
        label: "组合",
        detail: `${avoidNote}，选择一份${foods[0] || "优质蛋白"}、半盘蔬菜和适量主食。`,
      },
    ],
    rationale: `今天仍有约 ${calories} kcal 的可安排空间；按每日 ${mealsPerDay} 餐规律进食更稳妥。`,
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
  if (!content || content.length > 500 || unsafeStreamTextPattern.test(content) || streamPresentationPattern.test(content)) {
    throw new PublicCoachDataError("COACH_STREAM_INVALID");
  }
  return content;
}

function stripCoachPresentationMarkup(value) {
  return String(value ?? "")
    .replace(/\*\*/g, "")
    .replace(/`/g, "")
    .replace(/^\s*#{1,6}\s*/gm, "")
    .replace(/^\s*(?:回复|答复|回答|建议|说明)\s*[:：]\s*/gm, "")
    .trim();
}

function takeCompleteSentences(value) {
  const match = /^(.*[。！？\n])/.exec(value);
  return match ? { text: match[1], rest: value.slice(match[1].length) } : { text: "", rest: value };
}

function createCoachDataService({ db, getDailySummary, getWeeklyReview, getAccount, answer, streamAnswer, dailyTip, clock = () => new Date(), model = "deepseek-v4-flash" }) {
  if (!db || typeof db.from !== "function" || typeof getDailySummary !== "function" || typeof getWeeklyReview !== "function" || typeof getAccount !== "function") {
    throw new Error("Coach dependencies are unavailable");
  }

  const contextInflight = new Map();

  async function getConversation(userId) {
    const current = await db.from("coach_conversations").select("id").eq("user_id", userId).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (current.error) throw new Error(current.error.message || "Coach conversation read failed");
    if (current.data?.id) return current.data.id;
    const created = await db.from("coach_conversations").insert({ user_id: userId, title: "营养教练" }).select("id").single();
    if (created.error || !created.data?.id) throwConversationCreateError(created.error);
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
    if (created.error || !created.data?.id) throwConversationCreateError(created.error);
    return { conversationId: created.data.id, messages: [] };
  }

  async function buildContext(userId, date) {
    const key = `${userId}:${date}`;
    const pending = contextInflight.get(key);
    if (pending) return pending;
    // Coach tip/brief/chat only need today's snapshot + account. Skip the 7-day
    // weekly meal scan and weekly LLM so coach entry stays interactive.
    const promise = Promise.all([
      getDailySummary(userId, date),
      getAccount(userId),
    ]).then(([daily, account]) => createContext(daily, {
      recordedDays: Array.isArray(daily?.meals) && daily.meals.length ? 1 : 0,
      proteinCompletion: safeNumber(daily?.completion),
      score: safeNumber(daily?.completion),
    }, account))
      .finally(() => {
        // Keep shared context briefly so parallel brief+tip/chat still coalesce.
        setTimeout(() => contextInflight.delete(key), 1500);
      });
    contextInflight.set(key, promise);
    return promise;
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
        const cleanSentence = stripCoachPresentationMarkup(sentence.text);
        if (cleanSentence) {
          content += cleanSentence;
          validateStreamedText(content);
          yield { type: "delta", text: cleanSentence };
        }
      }
      const cleanPending = stripCoachPresentationMarkup(pending);
      content += cleanPending;
      content = validateStreamedText(content);
      if (cleanPending) yield { type: "delta", text: cleanPending };
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
    const fallbackPrompts = quickPromptsForContext(context);
    // Keep brief on the rule-based prompt pack so coach entry stays interactive.
    // LLM generation remains reserved for daily tips and chat replies.
    return {
      date: safeDate,
      serverTime: clock().toISOString(),
      priority,
      remaining: context.daily.remaining,
      completion: context.daily.completion,
      heroPrompt: fallbackPrompts[0],
      quickPrompts: fallbackPrompts.slice(0, 4),
    };
  }

  async function getDailyTip(userId, date, options = {}) {
    const safeDate = normalizeDate(date);
    const context = await buildContext(userId, safeDate);
    const contextHash = tipContextHash(context);
    const refresh = Boolean(options.refresh);

    if (!refresh) {
      try {
        const cached = await readCachedDailyTip(userId, safeDate, contextHash);
        if (cached) return cached;
      } catch {
        // Cache misses or schema lag must not block tip generation.
      }
    }

    const generated = typeof dailyTip === "function"
      ? await dailyTip({ date: safeDate, context })
      : {
          type: "nutrition_tip",
          headline: "下一餐保持均衡",
          content: "选择一份优质蛋白、半盘蔬菜和适量主食，让今天的饮食更完整。",
          food: null,
          source: "rule_v2",
          model: null,
        };

    try {
      await writeCachedDailyTip(userId, safeDate, contextHash, generated);
    } catch {
      // Tip remains usable even when the optional cache write fails.
    }
    return { ...generated, cached: false };
  }

  async function readCachedDailyTip(userId, tipDate, contextHash) {
    const lookup = await db.from("coach_daily_tips")
      .select("context_hash,payload,provider,model")
      .eq("user_id", userId)
      .eq("tip_date", tipDate)
      .maybeSingle();
    if (lookup.error) throw new Error("Coach daily tip cache read failed");
    const row = lookup.data;
    if (!row || row.context_hash !== contextHash || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
      return null;
    }
    const type = typeof row.payload.type === "string" ? row.payload.type : "";
    const headline = typeof row.payload.headline === "string" ? row.payload.headline.trim() : "";
    const content = typeof row.payload.content === "string" ? row.payload.content.trim() : "";
    if (!type || !headline || !content) return null;
    return {
      type,
      headline,
      content,
      food: row.payload.food ?? null,
      source: row.provider ?? "rule_v2",
      model: row.model ?? null,
      cached: true,
    };
  }

  async function writeCachedDailyTip(userId, tipDate, contextHash, tip) {
    const provider = ["deepseek", "hunyuan-exp", "rule_v2"].includes(tip?.source) ? tip.source : "rule_v2";
    const persisted = await db.from("coach_daily_tips").upsert({
      user_id: userId,
      tip_date: tipDate,
      context_hash: contextHash,
      payload: {
        type: tip.type,
        headline: tip.headline,
        content: tip.content,
        food: tip.food ?? null,
      },
      provider,
      model: tip.model ?? null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,tip_date" });
    if (persisted.error) throw new Error("Coach daily tip cache write failed");
  }

  return { getMessages, sendMessage, streamMessage, getBrief, restartConversation, getDailyTip };
}

module.exports = {
  PublicCoachDataError,
  createCoachDataService,
  createContext,
  createRuleReply,
  proteinFoodSuggestions,
  quickPromptsForContext,
};
