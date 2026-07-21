class PublicCoachError extends Error {
  constructor(code, message = "营养教练暂不可用") {
    super(message);
    this.code = code;
  }
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
          temperature: 0.3,
          max_tokens: 500,
          messages: [
            {
              role: "system",
              content: "你是 Nordic Nutri 的日常营养教练。依据提供的目标和饮食记录，用简洁中文给出可执行建议。不得诊断、治疗或替代医生；遇到疾病、药物、孕产或进食障碍问题，建议咨询专业人员。回答不超过 500 个汉字。",
            },
            ...history.map((message) => ({
              role: message.role === "assistant" ? "assistant" : "user",
              content: String(message.content ?? "").slice(0, 1000),
            })),
            { role: "user", content: JSON.stringify({ prompt, nutritionContext: context }) },
          ],
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

function createDeepseekCoachService({ apiKey, model, requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createDeepseekRequestCompletion({ apiKey, model, fetchImpl });
  return async (input) => {
    const request = validateInput(input);
    const response = await complete(request);
    const content = typeof response === "string" ? response.trim() : "";
    if (!content || content.length > 1200) throw new PublicCoachError("COACH_RETRYABLE");
    return content;
  };
}

module.exports = { createDeepseekCoachService, PublicCoachError };
