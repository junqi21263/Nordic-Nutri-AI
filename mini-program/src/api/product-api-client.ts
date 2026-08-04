import Taro from "@tarojs/taro";
import { useAuthStore } from "../auth/auth-store";
import { clearInvalidSession } from "../auth/session-manager";
import { clearProductLocalState } from "../features/account-cancellation/clear-local-state";
import { productApiEndpoint } from "./product-api-config";

export type ProductApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ProductApiRequest {
  method: ProductApiMethod;
  data?: Record<string, unknown>;
  fallbackMessage: string;
  /** Milliseconds. Defaults keep UI from hanging on cold LLM/DB paths. */
  timeout?: number;
}

const DEFAULT_PRODUCT_API_TIMEOUT_MS = 15_000;

export async function requestProductApi<T>(path: string, request: ProductApiRequest): Promise<T> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error("登录状态已失效，请重新登录");
  const response = await Taro.request<unknown>({
    url: `${productApiEndpoint}${path}`,
    method: request.method,
    header: {
      authorization: `Bearer ${token}`,
      ...(request.data ? { "content-type": "application/json" } : {}),
      // Avoid sticky 410/error responses from DevTools or system proxy disk cache.
      "cache-control": "no-cache",
    },
    ...(request.data ? { data: request.data } : {}),
    timeout: request.timeout ?? DEFAULT_PRODUCT_API_TIMEOUT_MS,
    enableCache: false,
  });
  const data = response.data as T & { code?: unknown; message?: unknown };
  if (response.statusCode !== 200) {
    const code = typeof data?.code === "string" ? data.code : "ProductApiRequestError";
    if (response.statusCode === 401 || code === "UNAUTHORIZED" || code === "SESSION_USER_MISSING") {
      // Must wipe persisted storage too — memory-only clear lets restoreSession
      // revive a JWT whose app_users row is gone (SESSION_USER_MISSING loop).
      await clearInvalidSession();
      if (code === "SESSION_USER_MISSING") clearProductLocalState();
    }
    const message =
      code === "SESSION_USER_MISSING" || code === "UNAUTHORIZED"
        ? "登录已失效，请重新登录"
        : typeof data?.message === "string" && data.message.trim()
          ? data.message
          : request.fallbackMessage;
    const error = new Error(message);
    error.name = code;
    throw error;
  }
  return data;
}
