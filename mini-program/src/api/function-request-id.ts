type JsonReader = { json: () => Promise<unknown> };
type CloneableResponse = { clone: () => JsonReader; status?: unknown };

export interface FunctionDiagnostics {
  httpStatus: number | null;
  errorCode: string | null;
  message: string | null;
  requestId: string | null;
  errorName: string | null;
  errorKind: string | null;
}

const safeMessages: Record<string, string> = {
  UNAUTHORIZED: "认证未通过或会话已过期",
  FORBIDDEN: "无权访问该资源",
  VALIDATION_ERROR: "请求参数无效",
  NOT_FOUND: "请求的资源不存在",
  CONFLICT: "请求冲突或已重复使用",
  RATE_LIMITED: "请求过于频繁，请稍后重试",
  AI_SERVICE_ERROR: "外部认证服务暂不可用",
  STORAGE_ERROR: "存储服务暂不可用",
  DATABASE_ERROR: "服务端数据操作失败",
  NOT_IMPLEMENTED: "当前能力尚未配置",
  INTERNAL_ERROR: "服务端内部错误",
  HTTP_ERROR: "网络请求失败",
};

const safeErrorKinds = new Set([
  "FunctionsHttpError",
  "FunctionsRelayError",
  "FunctionsFetchError",
  "WechatFetchError",
  "WechatFetchUnavailableError",
  "AbortError",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isCloneableResponse(value: unknown): value is CloneableResponse {
  return isRecord(value) && typeof value.clone === "function";
}

function readErrorCode(value: unknown): string | null {
  if (!isRecord(value) || typeof value.code !== "string") return null;
  return Object.prototype.hasOwnProperty.call(safeMessages, value.code) ? value.code : "HTTP_ERROR";
}

function readStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function readSafeErrorName(value: unknown): string | null {
  if (!isRecord(value) || typeof value.name !== "string") return null;
  return safeErrorKinds.has(value.name) ? value.name : "LocalError";
}

function safeMessageForErrorKind(errorKind: string | null): string | null {
  if (errorKind === "AbortError") return "请求已取消";
  if (errorKind === "FunctionsFetchError" || errorKind === "WechatFetchError" || errorKind === "WechatFetchUnavailableError") {
    return "网络请求未获得 HTTP 响应";
  }
  if (errorKind === "LocalError") return "本地请求失败";
  return null;
}

export function truncateUserId(userId: string | null | undefined): string | null {
  if (!userId) return null;
  return userId.length > 12 ? `${userId.slice(0, 8)}…${userId.slice(-4)}` : userId;
}

export function truncateProjectRef(supabaseUrl: string): string | null {
  try {
    const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
    return projectRef.length > 8 ? `${projectRef.slice(0, 4)}…${projectRef.slice(-4)}` : projectRef;
  } catch {
    return null;
  }
}

export async function extractFunctionDiagnostics(error: unknown): Promise<FunctionDiagnostics> {
  const fallbackCode = isRecord(error) ? readErrorCode(error) : null;
  const fallbackStatus = isRecord(error) ? readStatus(error.status) : null;
  const fallback: FunctionDiagnostics = {
    httpStatus: fallbackStatus,
    errorCode: fallbackCode,
    message: fallbackCode ? safeMessages[fallbackCode] : safeMessageForErrorKind(readSafeErrorName(error)),
    requestId: null,
    errorName: readSafeErrorName(error),
    errorKind: readSafeErrorName(error),
  };
  if (!isRecord(error) || !isCloneableResponse(error.context)) return fallback;

  try {
    const body = await error.context.clone().json();
    const errorCode = isRecord(body) && isRecord(body.error) ? readErrorCode(body.error) : fallback.errorCode;
    return {
      httpStatus: readStatus(error.context.status) ?? fallback.httpStatus,
      errorCode,
      message: errorCode ? safeMessages[errorCode] : fallback.message,
      requestId: isRecord(body) && typeof body.requestId === "string" ? body.requestId : null,
      errorName: fallback.errorName,
      errorKind: fallback.errorKind,
    };
  } catch {
    return {
      ...fallback,
      httpStatus: readStatus(error.context.status) ?? fallback.httpStatus,
    };
  }
}

export async function extractFunctionRequestId(error: unknown): Promise<string | undefined> {
  return (await extractFunctionDiagnostics(error)).requestId ?? undefined;
}
