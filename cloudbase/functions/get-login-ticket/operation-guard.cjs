class PublicOperationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function createOperationGuard({ db }) {
  if (!db || typeof db.rpc !== "function") throw new Error("Operation guard database RPC is unavailable");

  async function call(name, input) {
    const result = await db.rpc(name, input);
    if (result?.error) throw new Error(`Operation guard ${name} failed`);
    return Array.isArray(result?.data) ? result.data[0] : result?.data;
  }

  return {
    async claim(userId, operation, clientRequestId) {
      const record = await call("claim_operation_request", {
        p_user_id: userId,
        p_operation: operation,
        p_client_request_id: clientRequestId,
      });
      if (!record?.claimed) {
        if (record?.state === "succeeded") return { response: record.response, reused: true };
        throw new PublicOperationError("OPERATION_IN_PROGRESS", "请求正在处理中，请勿重复提交");
      }
      return { response: null, reused: false };
    },
    async fail(userId, operation, clientRequestId, errorCode) {
      await call("complete_operation_request", {
        p_user_id: userId,
        p_operation: operation,
        p_client_request_id: clientRequestId,
        p_state: "failed",
        p_error_code: errorCode,
      });
    },
  };
}

module.exports = { PublicOperationError, createOperationGuard };
