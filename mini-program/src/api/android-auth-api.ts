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

async function defaultRequest(
  path: string,
  data: Record<string, unknown> = {},
  method: "GET" | "POST" = "POST",
) {
  const { default: Taro } = await import("@tarojs/taro");
  const token = useAuthStore.getState().session?.accessToken;
  const response = await Taro.request<unknown>({
    url: `${productApiEndpoint}${path}`,
    method,
    ...(method === "POST" ? { data } : {}),
    header: {
      "content-type": "application/json",
      "cache-control": "no-cache",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    timeout: 15_000,
    enableCache: false,
  });
  const body = response.data as { code?: unknown; message?: unknown };
  if (response.statusCode < 200 || response.statusCode >= 300) {
    const code = typeof body?.code === "string" ? body.code : "AUTH_UNAVAILABLE";
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
    sendPhoneCode: (input: { phone: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/register/phone/send-code", input),
    registerEmail: (input: { email: string; code: string; password: string }) =>
      request("/auth/register/email", input),
    registerPhone: (input: { phone: string; code: string; password: string }) =>
      request("/auth/register/phone", input),
    loginEmail: (input: {
      email: string;
      password: string;
      captchaId: string;
      captchaAnswer: string;
    }) => request("/auth/login/email", input),
    loginPhone: (input: {
      phone: string;
      password: string;
      captchaId: string;
      captchaAnswer: string;
    }) => request("/auth/login/phone", input),
    loginGoogle: (idToken: string) => request("/auth/login/google", { idToken }),
    forgotEmail: (input: { email: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/password/forgot/email", input),
    forgotPhone: (input: { phone: string; captchaId: string; captchaAnswer: string }) =>
      request("/auth/password/forgot/phone", input),
    resetPassword: (input: {
      target: string;
      targetType: "email" | "phone";
      code: string;
      password: string;
    }) => request("/auth/password/reset", input),
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
