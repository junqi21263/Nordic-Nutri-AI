class PublicDeepseekBudgetError extends Error {
  constructor(code = "DEEPSEEK_DAILY_LIMIT_REACHED", message = "今日 AI 配额已用完，请明天再试") {
    super(message);
    this.code = code;
  }
}

function normalizeRecord(value) {
  return Array.isArray(value?.data) ? value.data[0] : value?.data;
}

function createDeepseekBudgetService({
  db,
  callLimit = 50,
  tokenLimit = 120_000,
} = {}) {
  if (!db || typeof db.from !== "function") {
    throw new Error("DeepSeek budget database is unavailable");
  }

  const resolvedCallLimit = Math.min(500, Math.max(1, Number(callLimit) || 50));
  const resolvedTokenLimit = Math.min(5_000_000, Math.max(1000, Number(tokenLimit) || 120_000));

  async function rpc(name, input) {
    if (typeof db.rpc !== "function") return null;
    const result = await db.rpc(name, input);
    if (result?.error) throw new Error(`DeepSeek budget ${name} failed`);
    return normalizeRecord(result);
  }

  return {
    callLimit: resolvedCallLimit,
    tokenLimit: resolvedTokenLimit,

    async assertCanCall(userId) {
      if (!userId) throw new PublicDeepseekBudgetError("UNAUTHORIZED", "未登录");
      const record = await rpc("consume_deepseek_daily_budget", {
        p_user_id: userId,
        p_call_limit: resolvedCallLimit,
        p_token_limit: resolvedTokenLimit,
        p_token_units: 0,
      });
      if (!record) {
        // Fallback: allow when RPC unavailable (local tests / degraded).
        return { allowed: true, callUsed: 0, tokenUsed: 0, degraded: true };
      }
      if (!record.allowed) {
        throw new PublicDeepseekBudgetError(
          "DEEPSEEK_DAILY_LIMIT_REACHED",
          "今日 AI 配额已用完，请明天再试",
        );
      }
      return {
        allowed: true,
        callUsed: Number(record.call_used ?? record.callUsed ?? 0),
        tokenUsed: Number(record.token_used ?? record.tokenUsed ?? 0),
      };
    },

    async recordTokens(userId, usage) {
      if (!userId) return null;
      const tokens = Math.max(
        0,
        Number(usage?.totalTokens ?? usage?.total_tokens ?? 0)
          || ((Number(usage?.promptTokens ?? usage?.prompt_tokens ?? 0) || 0)
            + (Number(usage?.completionTokens ?? usage?.completion_tokens ?? 0) || 0)),
      );
      if (!tokens) return null;
      const record = await rpc("add_deepseek_daily_tokens", {
        p_user_id: userId,
        p_token_units: tokens,
        p_token_limit: resolvedTokenLimit,
      });
      return {
        tokenUsed: Number(record?.token_used ?? record?.tokenUsed ?? tokens),
        added: tokens,
      };
    },

    async getUsage(userId) {
      const record = await rpc("get_deepseek_daily_budget_usage", { p_user_id: userId });
      const callUsed = Number(record?.call_used ?? record?.callUsed ?? 0);
      const tokenUsed = Number(record?.token_used ?? record?.tokenUsed ?? 0);
      return {
        calls: {
          used: callUsed,
          limit: resolvedCallLimit,
          remaining: Math.max(0, resolvedCallLimit - callUsed),
        },
        tokens: {
          used: tokenUsed,
          limit: resolvedTokenLimit,
          remaining: Math.max(0, resolvedTokenLimit - tokenUsed),
        },
      };
    },
  };
}

module.exports = {
  PublicDeepseekBudgetError,
  createDeepseekBudgetService,
};
