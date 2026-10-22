import { pauseAnalytics, trackAnalytics } from "../features/analytics/runtime";
import { productRequestObservation } from "../features/analytics/observations";
import { productTransport } from "../platform/product-transport";
import { getLocale, t } from "../i18n";
import { useAuthStore } from "../auth/auth-store";
import { clearInvalidSession, refreshSession } from "../auth/session-manager";
import { clearProductLocalState } from "../features/account-cancellation/clear-local-state";
import { productApiEndpoint } from "./product-api-config";

export type ProductApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface ProductApiRequest {
  method: ProductApiMethod;
  data?: Record<string, unknown>;
  fallbackMessage: string;
  /** Milliseconds. Defaults keep UI from hanging on cold LLM/DB paths. */
  timeout?: number;
}

const DEFAULT_PRODUCT_API_TIMEOUT_MS = 15_000;

export async function requestProductApi<T>(path: string, request: ProductApiRequest): Promise<T> {
  const release = pauseAnalytics();
  const start = productRequestObservation(path, request.method, "start", Boolean(request.data?.analysisId), Boolean(request.data?.templateId));
  if (start) trackAnalytics(start.name, start.properties);
  try {
    const result = await requestProductApiAttempt<T>(path, request, true);
    const success = productRequestObservation(path, request.method, "success");
    if (success) trackAnalytics(success.name, success.properties);
    return result;
  } finally { release(); }
}

async function requestProductApiAttempt<T>(path: string, request: ProductApiRequest, allowRefresh: boolean): Promise<T> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error(t("common.sessionExpired"));
  const response = await productTransport<unknown>({
    url: `${productApiEndpoint}${path}`,
    method: request.method,
    header: {
      authorization: `Bearer ${token}`,
      "accept-language": getLocale(),
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
      if (allowRefresh && code !== "SESSION_USER_MISSING") {
        const refreshed = await refreshSession();
        if (refreshed?.accessToken) return requestProductApiAttempt<T>(path, request, false);
      }
      // Must wipe persisted storage too — memory-only clear lets restoreSession
      // revive a JWT whose app_users row is gone (SESSION_USER_MISSING loop).
      await clearInvalidSession();
      if (code === "SESSION_USER_MISSING") clearProductLocalState();
    }
    const message =
      code === "SESSION_USER_MISSING" || code === "UNAUTHORIZED"
        ? t("common.sessionExpired")
        : typeof data?.message === "string" && data.message.trim()
          ? data.message
          : request.fallbackMessage;
    const error = new Error(message);
    error.name = code;
    throw error;
  }
  return data;
}
