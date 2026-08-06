function extractOpenAiUsage(payload) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens) || 0;
  const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens) || 0;
  const totalTokens = Number(usage.total_tokens ?? usage.totalTokens) || (promptTokens + completionTokens);
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function extractUsageFromAny(payload) {
  if (!payload || typeof payload !== "object") return null;
  const direct = extractOpenAiUsage(payload);
  if (direct) return direct;
  if (payload.usageMetadata && typeof payload.usageMetadata === "object") {
    const meta = payload.usageMetadata;
    const promptTokens = Number(meta.promptTokenCount ?? meta.prompt_tokens ?? meta.inputTokens) || 0;
    const completionTokens = Number(meta.candidatesTokenCount ?? meta.completion_tokens ?? meta.outputTokens) || 0;
    const totalTokens = Number(meta.totalTokenCount ?? meta.total_tokens) || (promptTokens + completionTokens);
    if (promptTokens || completionTokens || totalTokens) {
      return { promptTokens, completionTokens, totalTokens };
    }
  }
  if (payload.rawResponse) return extractUsageFromAny(payload.rawResponse);
  if (Array.isArray(payload.rawResponses) && payload.rawResponses.length) {
    for (let i = payload.rawResponses.length - 1; i >= 0; i -= 1) {
      const nested = extractUsageFromAny(payload.rawResponses[i]);
      if (nested) return nested;
    }
  }
  if (payload.data) return extractUsageFromAny(payload.data);
  const promptTokens = Number(payload.promptTokens ?? payload.prompt_tokens ?? payload.inputTokens) || 0;
  const completionTokens = Number(payload.completionTokens ?? payload.completion_tokens ?? payload.outputTokens) || 0;
  const totalTokens = Number(payload.totalTokens ?? payload.total_tokens) || (promptTokens + completionTokens);
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function extractContentAndUsage(payload) {
  return {
    content: payload?.choices?.[0]?.message?.content ?? null,
    usage: extractOpenAiUsage(payload),
    model: typeof payload?.model === "string" ? payload.model : null,
  };
}

async function recordModelUsage(observability, {
  model,
  feature,
  usage = null,
  requests = 1,
  provider = null,
} = {}) {
  if (!observability?.recordMetric || !model) return;
  const meta = {
    model,
    feature: feature || null,
    provider: provider || null,
  };
  const jobs = [];
  if (requests) {
    jobs.push(observability.recordMetric("model_request", requests, meta));
  }
  if (usage?.totalTokens) {
    jobs.push(observability.recordMetric("model_tokens", usage.totalTokens, meta));
  }
  if (usage?.promptTokens) {
    jobs.push(observability.recordMetric("model_tokens_input", usage.promptTokens, meta));
  }
  if (usage?.completionTokens) {
    jobs.push(observability.recordMetric("model_tokens_output", usage.completionTokens, meta));
  }
  await Promise.all(jobs.map((job) => Promise.resolve(job).catch(() => undefined)));
}

function trackModelCall(observabilityRef, {
  model,
  feature,
  provider = null,
  usage = null,
  requests = 0,
} = {}) {
  return recordModelUsage(observabilityRef?.observability || observabilityRef, {
    model,
    feature,
    provider,
    usage,
    requests,
  }).catch(() => undefined);
}

module.exports = {
  extractOpenAiUsage,
  extractUsageFromAny,
  extractContentAndUsage,
  recordModelUsage,
  trackModelCall,
};
