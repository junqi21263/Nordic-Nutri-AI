const priorities = new Set(["protein", "calories", "carbs", "fat", "fiber", "regularity", "logging"]);
const safetyLevels = new Set(["none", "professional_consultation", "urgent_care"]);
const unsafeMedicalWording = /诊断|治疗|处方|药物|用药|孕期|怀孕|哺乳|厌食|暴食/i;
const forbiddenPresentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;

const COACH_SYSTEM_PROMPT = `你是 Nordic Nutri 的专业日常营养教练。系统提供的 nutritionContext 是唯一权威营养事实；不得猜测、补造或改写未提供的体重、疾病、训练量、食材热量、餐食记录或目标。依据用户目标、当天记录、一周趋势与 preferences（饮食模式、忌口、每日餐次），用简洁中文给出可执行的日常饮食建议；区分增肌、减脂、维持目标，但不要把每周训练天数误认为今天正在训练。推荐食材与搭配不得与 foodAvoidances / foodAvoidanceLabels 冲突，并须贴合 dietaryPattern 与 mealsPerDay。

你可以自然回答：具体食物的常见营养特点、怎么搭配进今日饮食、餐次安排、加餐选择、外食取舍、训练恢复饮食，以及用户在对话中追问的“XX呢 / 怎么样”。把食物说明放在日常饮食语境里，可结合用户当天剩余营养给出用量建议；不要把营养说明表述为预防或治疗疾病的功效。仅当问题明显与饮食营养无关时，才一两句轻轻引导回饮食话题，不要说教或反复强调边界。

不得诊断、治疗、开具处方或替代医生；遇到疾病、药物、孕产、未成年人、进食障碍或严重不适，只给出谨慎的就医或专业咨询建议。不要鼓励极端节食、暴食、代偿、危险补剂或不安全运动。不要要求或输出用户的身份信息。

只输出一个 JSON 对象，不要 Markdown、代码块或额外解释。禁止使用双星号加粗、星号、反引号或以“回复：”“答复：”“回答：”“建议：”“说明：”开头；对象字段值必须是可直接展示的纯文本。对象必须为：{"priority":"protein|calories|carbs|fat|fiber|regularity|logging","headline":"不超过32个字符","actions":[{"label":"不超过16个字符","detail":"不超过80个字符"}],"rationale":"不超过120个字符","safety":"none|professional_consultation|urgent_care"}。actions 必须有 1 至 3 项。`;
const COACH_STREAM_SYSTEM_PROMPT = `你是 Nordic Nutri 的专业日常营养教练。nutritionContext 是唯一权威营养事实；不得猜测、补造或改写未提供的体重、疾病、训练量、食材热量、餐食记录或目标。必须尊重 preferences 中的饮食模式、忌口与每日餐次，推荐食材不得与忌口冲突。

你可以自然回答具体食物的营养特点、餐次搭配、加餐、外食与训练恢复饮食，以及用户追问的“XX呢 / 怎么样”；把建议放在日常饮食语境，并结合当天记录给出可执行用量。不要把营养说明表述为防病治病功效。仅当明显跑题时才简短引导回饮食，不要说教。用简洁中文直接回答：先给一句结论，再给至多三条可执行建议；总字数不超过 500 字。不得诊断、治疗、开具处方或替代医生，不得涉及药物、孕产、未成年人、进食障碍或紧急症状。输出约束：不要 JSON、Markdown、代码块、标题符号或身份信息；禁止使用双星号加粗、星号、反引号或以“回复：”“答复：”“回答：”“建议：”“说明：”开头。只输出可直接展示的纯文本。`;

class PublicCoachError extends Error {
  constructor(code, message = "营养教练暂不可用") {
    super(message);
    this.code = code;
  }
}

function boundedText(value, maxLength) {
  return typeof value === "string" && value.trim() && value.trim().length <= maxLength ? value.trim() : null;
}

function validateReply(payload) {
  let result = payload;
  try {
    if (typeof result === "string") result = JSON.parse(result);
  } catch {
    throw new PublicCoachError("COACH_RETRYABLE");
  }
  if (!result || typeof result !== "object" || Array.isArray(result) || !priorities.has(result.priority) || !safetyLevels.has(result.safety)) {
    throw new PublicCoachError("COACH_RETRYABLE");
  }
  const headline = boundedText(result.headline, 32);
  const rationale = boundedText(result.rationale, 120);
  if (!headline || !rationale || !Array.isArray(result.actions) || result.actions.length < 1 || result.actions.length > 3) {
    throw new PublicCoachError("COACH_RETRYABLE");
  }
  const actions = result.actions.map((action) => {
    const label = boundedText(action?.label, 16);
    const detail = boundedText(action?.detail, 80);
    if (!label || !detail) throw new PublicCoachError("COACH_RETRYABLE");
    return { label, detail };
  });
  const text = [headline, rationale, ...actions.flatMap((action) => [action.label, action.detail])].join("\n");
  if (result.safety === "none" && (unsafeMedicalWording.test(text) || forbiddenPresentationWording.test(text))) {
    throw new PublicCoachError("COACH_RETRYABLE");
  }
  return { priority: result.priority, headline, actions, rationale, safety: result.safety };
}

function validateInput(input) {
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
  if (!prompt || prompt.length > 1000) throw new PublicCoachError("COACH_INPUT_INVALID", "问题无效");
  return {
    prompt,
    context: input?.context && typeof input.context === "object" ? input.context : {},
    history: Array.isArray(input?.history) ? input.history.slice(-10) : [],
  };
}

function buildMessages({ prompt, context, history, systemPrompt }) {
  return [
    { role: "system", content: systemPrompt },
    ...history.map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content ?? "").slice(0, 1000),
    })),
    { role: "user", content: JSON.stringify({ prompt, nutritionContext: context }) },
  ];
}

const { extractContentAndUsage, extractOpenAiUsage } = require("./model-usage.cjs");

function createDeepseekRequestCompletion({ apiKey, model, fetchImpl = globalThis.fetch }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async ({ prompt, context, history }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: 500,
          messages: buildMessages({ prompt, context, history, systemPrompt: COACH_SYSTEM_PROMPT }),
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new PublicCoachError("COACH_RETRYABLE");
      const data = await response.json();
      const parsed = extractContentAndUsage(data);
      return { content: parsed.content, usage: parsed.usage, model: selectedModel };
    } catch (error) {
      if (error instanceof PublicCoachError) throw error;
      throw new PublicCoachError("COACH_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

async function* readSseJson(body) {
  const decoder = new TextDecoder();
  let buffer = "";
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    let separator = buffer.indexOf("\n\n");
    while (separator >= 0) {
      const frame = buffer.slice(0, separator);
      buffer = buffer.slice(separator + 2);
      separator = buffer.indexOf("\n\n");
      const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
      if (!data || data === "[DONE]") continue;
      try {
        yield JSON.parse(data);
      } catch {
        throw new PublicCoachError("COACH_RETRYABLE");
      }
    }
  }
}

function createDeepseekCoachStreamService({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async function* (input) {
    const { prompt, context, history } = validateInput(input);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 28_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          temperature: 0.2,
          max_tokens: 600,
          stream: true,
          stream_options: { include_usage: true },
          messages: buildMessages({ prompt, context, history, systemPrompt: COACH_STREAM_SYSTEM_PROMPT }),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new PublicCoachError("COACH_RETRYABLE");
      let usage = null;
      for await (const payload of readSseJson(response.body)) {
        const nextUsage = extractOpenAiUsage(payload);
        if (nextUsage) usage = nextUsage;
        const text = payload?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      }
      if (usage) yield { type: "usage", usage, model: selectedModel };
    } catch (error) {
      if (error instanceof PublicCoachError) throw error;
      throw new PublicCoachError("COACH_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

function createDeepseekCoachService({ apiKey, model, requestCompletion, fetchImpl } = {}) {
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  const complete = requestCompletion ?? createDeepseekRequestCompletion({ apiKey, model: selectedModel, fetchImpl });
  return async (input) => {
    const raw = await complete(validateInput(input));
    let content = raw;
    let usage = null;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      usage = raw.usage || null;
      if ("content" in raw && !("priority" in raw) && !("headline" in raw) && !("actions" in raw)) {
        content = raw.content;
      }
    }
    return { ...validateReply(content), usage: usage || null, model: selectedModel };
  };
}

module.exports = { COACH_SYSTEM_PROMPT, COACH_STREAM_SYSTEM_PROMPT, PublicCoachError, createDeepseekCoachService, createDeepseekCoachStreamService, validateReply };
