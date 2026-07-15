export interface AppQueryError {
  code: "network" | "unauthorized" | "unknown";
  message: string;
  retryable: boolean;
}

export function mapQueryError(error: unknown): AppQueryError {
  const message = error instanceof Error ? error.message : "发生未知错误";
  if (/unauthorized|401/i.test(message))
    return { code: "unauthorized", message: "登录状态已失效", retryable: false };
  if (/network|timeout|fetch/i.test(message))
    return { code: "network", message: "网络连接不稳定", retryable: true };
  return { code: "unknown", message, retryable: true };
}
