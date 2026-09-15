import { productApiEndpoint } from "./product-api-config";
import type { AppAuthSession, AppAuthUser } from "../auth/auth-store";
import { useAuthStore } from "../auth/auth-store";

export type AndroidAuthSessionResult = {
  user: AppAuthUser;
  session: { accessToken: string; expiresIn: number };
  onboardingRequired?: boolean;
};

export type AndroidCaptcha = { captchaId: string; image: string; expiresIn: number };
export type AndroidAuthRequest = (
  path: string,
  data?: Record<string, unknown>,
  method?: "GET" | "POST",
) => Promise<unknown>;

type VConsoleNetworkItem = Record<string, unknown>;
type VConsoleNetwork = {
  add: (item: VConsoleNetworkItem) => { id?: string };
  update: (id: string, item: VConsoleNetworkItem) => void;
};

declare global {
  interface Window {
    __VCONSOLE_INSTANCE?: { network?: VConsoleNetwork };
  }
}

export class AndroidAuthApiError extends Error {
  code: string;
  status?: number;

  constructor(code: string, message = code, status?: number) {
    super(message);
    this.name = "AndroidAuthApiError";
    this.code = code;
    this.status = status;
  }
}

function authDebug(event: string, detail: Record<string, unknown> = {}, level: "info" | "warn" | "error" = "info") {
  const payload = { scope: "android-auth", event, ...detail };
  console[level](`[android-auth] ${event}`, payload);
}

function errorDetail(error: unknown) {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { name?: unknown; message?: unknown };
    return {
      name: typeof candidate.name === "string" ? candidate.name : "UnknownError",
      message: typeof candidate.message === "string" ? candidate.message : "非 Error 异常",
    };
  }
  return { name: "UnknownError", message: String(error) };
}

function stringCode(data: unknown) {
  if (typeof data !== "object" || data === null) return undefined;
  const code = (data as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

function responseDetail(data: unknown) {
  const code = stringCode(data);
  return code ? { code } : {};
}

function beginNativeNetworkRecord(options: { method: string; url: string }, startTime: number) {
  if (typeof window === "undefined") return undefined;
  try {
    const network = window.__VCONSOLE_INSTANCE?.network;
    if (!network) return undefined;
    const item = network.add({
      method: options.method,
      url: options.url,
      status: "Pending",
      statusText: "Pending",
      requestType: "custom",
      header: {},
      requestHeader: { "content-type": "application/json" },
      responseType: "json",
      startTime,
    });
    return typeof item?.id === "string" ? { network, id: item.id } : undefined;
  } catch {
    return undefined;
  }
}

function updateNativeNetworkRecord(
  entry: ReturnType<typeof beginNativeNetworkRecord>,
  item: VConsoleNetworkItem,
) {
  if (!entry) return;
  try {
    entry.network.update(entry.id, item);
  } catch {
    // Debug tooling must never affect the authentication request.
  }
}

async function defaultRequest(
  path: string,
  data: Record<string, unknown> = {},
  method: "GET" | "POST" = "POST",
) {
  const token = useAuthStore.getState().session?.accessToken;
  const options = {
    url: `${productApiEndpoint}${path}`,
    method,
    ...(method === "POST" ? { data } : {}),
    headers: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  };
  const startedAt = Date.now();
  authDebug("request:start", { method, path });
  let response: { data: unknown; statusCode: number };
  let nativeNetworkRecord: ReturnType<typeof beginNativeNetworkRecord>;
  try {
    const { Capacitor, CapacitorHttp } = await import("@capacitor/core");
    if (Capacitor.isNativePlatform()) {
      nativeNetworkRecord = beginNativeNetworkRecord(options, startedAt);
      const nativeResponse = await CapacitorHttp.request({ ...options, responseType: "json", connectTimeout: 15_000, readTimeout: 15_000 });
      response = { data: nativeResponse.data, statusCode: nativeResponse.status };
      updateNativeNetworkRecord(nativeNetworkRecord, {
        status: nativeResponse.status,
        statusText: nativeResponse.status >= 200 && nativeResponse.status < 300 ? "OK" : "HTTP Error",
        response: nativeResponse.data,
        readyState: 4,
        endTime: Date.now(),
        costTime: Date.now() - startedAt,
      });
      authDebug("request:response", {
        status: nativeResponse.status,
        ...responseDetail(nativeResponse.data),
        path,
        transport: "capacitor-http",
        method,
        durationMs: Date.now() - startedAt,
      });
    } else {
      const { request: taroRequest } = await import("@tarojs/taro");
      response = await taroRequest<unknown>({ ...options, header: options.headers, timeout: 15_000, enableCache: false });
      authDebug("request:response", {
        status: response.statusCode,
        ...responseDetail(response.data),
        path,
        transport: "taro-request",
        method,
        durationMs: Date.now() - startedAt,
      });
    }
  } catch (error) {
    updateNativeNetworkRecord(nativeNetworkRecord, {
      status: "Error",
      statusText: "Network Error",
      response: { error: "request failed" },
      readyState: 4,
      endTime: Date.now(),
      costTime: Date.now() - startedAt,
    });
    authDebug("request:error", {
      method,
      path,
      durationMs: Date.now() - startedAt,
      ...errorDetail(error),
    }, "error");
    throw new AndroidAuthApiError("AUTH_NETWORK_ERROR", "连接失败，请检查网络后重试");
  }
  const body = response.data as { code?: unknown; message?: unknown };
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const code = typeof body?.code === "string" ? body.code : "AUTH_UNAVAILABLE";
    authDebug("request:backend-error", {
      status: response.statusCode,
      code,
      path,
      method,
    }, "warn");
    throw new AndroidAuthApiError(
      code,
      typeof body?.message === "string" ? body.message : code,
      response.statusCode,
    );
  }
  return response.data;
}

function createApi(request: AndroidAuthRequest) {
  return {
    getCaptcha: () => request("/auth/captcha", {}),
    sendEmailCode: (input: { email: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/register/email/send-code", input),
    registerEmail: (input: { email: string; code: string; password: string }) =>
      request("/auth/register/email", input),
    sendPhoneCode: (input: { phone: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/register/phone/send-code", input),
    registerPhone: (input: { phone: string; code: string; password: string }) =>
      request("/auth/register/phone", input),
    loginEmail: (input: { email: string; password: string }) => request("/auth/login/email", input),
    loginPhone: (input: { phone: string; password: string }) => request("/auth/login/phone", input),
    loginGoogle: (idToken: string) => request("/auth/login/google", { idToken }),
    forgotEmail: (input: { email: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/password/forgot/email", input),
    forgotPhone: (input: { phone: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/password/forgot/phone", input),
    resetPassword: (input: { targetType?: "email" | "phone"; email?: string; phone?: string; code: string; password: string }) =>
      request("/auth/password/reset", input),
    getMe: () => request("/auth/me", undefined, "GET"),
  };
}

export function createAndroidAuthApi({
  request = defaultRequest,
}: { request?: AndroidAuthRequest } = {}) {
  return createApi(request);
}

export const androidAuthApi = createAndroidAuthApi();

export function toAppSession(result: AndroidAuthSessionResult): AppAuthSession {
  return { user: result.user, accessToken: result.session.accessToken };
}
