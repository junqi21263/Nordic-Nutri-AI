const priorities = new Set(["protein", "calories", "carbs", "fat", "fiber", "regularity", "logging"]);
const safetyLevels = new Set(["none", "professional_consultation", "urgent_care"]);
const unsafeMedicalWording = /诊断|治疗|处方|药物|用药|孕期|怀孕|哺乳|厌食|暴食/i;

const COACH_SYSTEM_PROMPT = `你是 Nordic Nutri 的专业日常营养教练。系统提供的 nutritionContext 是唯一权威营养事实；不得猜测、补造或改写未提供的体重、疾病、训练量、食材热量、餐食记录或目标。依据用户目标、当天记录和一周趋势，用简洁中文给出可执行的日常饮食建议；区分增肌、减脂、维持目标，但不要把每周训练天数误认为今天正在训练。仅回答日常营养、饮食、食谱或训练恢复相关问题；其他话题应简洁说明边界并引导回营养问题。

不得诊断、治疗、开具处方或替代医生；遇到疾病、药物、孕产、未成年人、进食障碍或严重不适，只给出谨慎的就医或专业咨询建议。不要鼓励极端节食、暴食、代偿、危险补剂或不安全运动。不要要求或输出用户的身份信息。

只输出一个 JSON 对象，不要 Markdown、代码块或额外解释。对象必须为：{"priority":"protein|calories|carbs|fat|fiber|regularity|logging","headline":"不超过32个字符","actions":[{"label":"不超过16个字符","detail":"不超过80个字符"}],"rationale":"不超过120个字符","safety":"none|professional_consultation|urgent_care"}。actions 必须有 1 至 3 项。`;
const COACH_STREAM_SYSTEM_PROMPT = `你是 Nordic Nutri 的专业日常营养教练。nutritionContext 是唯一权威营养事实；不得猜测、补造或改写未提供的体重、疾病、训练量、食材热量、餐食记录或目标。只回答日常营养、饮食、食谱或训练恢复相关问题。用简洁中文直接回答用户：先给一句结论，再给至多三条可执行建议；总字数不超过 500 字。不得诊断、治疗、开具处方或替代医生，不得涉及药物、孕产、未成年人、进食障碍或紧急症状。不要输出 JSON、Markdown 代码块、标题符号或身份信息。`;

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
  if (result.safety === "none" && unsafeMedicalWording.test([headline, rationale, ...actions.flatMap((action) => [action.label, action.detail])].join("\n"))) {
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
      return data?.choices?.[0]?.message?.content;
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
          messages: buildMessages({ prompt, context, history, systemPrompt: COACH_STREAM_SYSTEM_PROMPT }),
        }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) throw new PublicCoachError("COACH_RETRYABLE");
      for await (const payload of readSseJson(response.body)) {
        const text = payload?.choices?.[0]?.delta?.content;
        if (typeof text === "string" && text) yield text;
      }
    } catch (error) {
      if (error instanceof PublicCoachError) throw error;
      throw new PublicCoachError("COACH_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

function createDeepseekCoachService({ apiKey, model, requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createDeepseekRequestCompletion({ apiKey, model, fetchImpl });
  return async (input) => validateReply(await complete(validateInput(input)));
}

module.exports = { COACH_SYSTEM_PROMPT, COACH_STREAM_SYSTEM_PROMPT, PublicCoachError, createDeepseekCoachService, createDeepseekCoachStreamService, validateReply };
