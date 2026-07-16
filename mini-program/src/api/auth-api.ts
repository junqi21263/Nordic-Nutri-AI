import Taro from "@tarojs/taro";
import { extractFunctionDiagnostics, truncateProjectRef } from "./function-request-id";
import { getPublicRuntimeConfig } from "./environment";
import { getSupabaseClient } from "../lib/supabase-client";
import { getCurrentUser, restoreSession } from "../auth/session-manager";

let loginInFlight: Promise<Awaited<ReturnType<typeof getCurrentUser>>> | null = null;

type WechatLoginFunctionResult = {
  data: {
    success: boolean;
    data?: { tokenHash: string };
    requestId?: string;
  } | null;
  error: unknown;
  response: Response | undefined;
};

export type WechatLoginStage =
  | "wxLogin"
  | "functionInvokeStart"
  | "functionInvokeResponse"
  | "functionErrorParse"
  | "verifyOtp"
  | "getUser";
export type WechatLoginStageStatus = "running" | "success" | "error";
export type WechatLoginObserver = (update: {
  stage: WechatLoginStage;
  status: WechatLoginStageStatus;
  requestId?: string | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  message?: string | null;
  errorName?: string | null;
  errorKind?: string | null;
  initializationStage?: string | null;
  causeName?: string | null;
  causeMessage?: string | null;
  missingCapability?: string | null;
}) => void;

function logFunctionEvent(event: "started" | "completed" | "failed", diagnostics?: {
  httpStatus?: number | null;
  requestId?: string | null;
}): void {
  if (getPublicRuntimeConfig().environment !== "development") return;
  console.info("[dev-auth] function-invoke-" + event, {
    targetProjectRef: truncateProjectRef(getPublicRuntimeConfig().supabaseUrl),
    httpStatus: diagnostics?.httpStatus ?? null,
    requestId: diagnostics?.requestId ?? null,
  });
}

function functionInvokeRuntimeError(): Error {
  const error = new Error("函数调用未到达 HTTP 响应层");
  error.name = "FunctionInvokeRuntimeError";
  return error;
}

export async function exchangeWechatTokenHash(tokenHash: string) {
  const { data, error } = await getSupabaseClient().auth.verifyOtp({ token_hash: tokenHash, type: "email" });
  if (error || !data.session) throw new Error("WeChat session exchange failed");
  return data.session;
}
export async function loginWithWechat(observer?: WechatLoginObserver) {
  if (!loginInFlight) {
    loginInFlight = (async () => {
      observer?.({ stage: "wxLogin", status: "running" });
      let login: Awaited<ReturnType<typeof Taro.login>>;
      try {
        login = await Taro.login();
      } catch (error) {
        observer?.({ stage: "wxLogin", status: "error", ...await extractFunctionDiagnostics(error) });
        throw error;
      }
      if (!login.code) throw new Error("WeChat login code is missing");
      observer?.({ stage: "wxLogin", status: "success" });

      observer?.({ stage: "functionInvokeStart", status: "running" });
      logFunctionEvent("started");
      let client: ReturnType<typeof getSupabaseClient>;
      try {
        client = getSupabaseClient();
      } catch (error) {
        const diagnostics = await extractFunctionDiagnostics(error);
        observer?.({ stage: "functionInvokeStart", status: "error", ...diagnostics });
        observer?.({ stage: "functionErrorParse", status: "success", ...diagnostics });
        logFunctionEvent("failed", diagnostics);
        throw error;
      }
      let functionResult: WechatLoginFunctionResult;
      try {
        functionResult = await client.functions.invoke<{
          success: boolean;
          data?: { tokenHash: string };
          requestId?: string;
        }>("wechat-login", { body: { code: login.code } }) as WechatLoginFunctionResult;
      } catch {
        const diagnostics = await extractFunctionDiagnostics(functionInvokeRuntimeError());
        observer?.({ stage: "functionInvokeResponse", status: "error", ...diagnostics });
        observer?.({ stage: "functionErrorParse", status: "success", ...diagnostics });
        logFunctionEvent("failed", diagnostics);
        throw functionInvokeRuntimeError();
      }
      const { data, error, response } = functionResult;
      const diagnostics = error
        ? await extractFunctionDiagnostics(error)
        : {
          httpStatus: response?.status ?? null,
          errorCode: null,
          message: null,
          requestId: data?.requestId ?? response?.headers.get("x-request-id") ?? null,
          errorName: null,
          errorKind: null,
        };
      if (error || !data?.success || !data.data?.tokenHash) {
        observer?.({ stage: "functionInvokeResponse", status: "error", ...diagnostics });
        observer?.({ stage: "functionErrorParse", status: "success", ...diagnostics });
        logFunctionEvent("failed", diagnostics);
        throw error ?? new Error("WeChat login failed");
      }

      observer?.({ stage: "functionInvokeResponse", status: "success", requestId: diagnostics.requestId ?? undefined });
      logFunctionEvent("completed", diagnostics);
      observer?.({ stage: "verifyOtp", status: "running" });
      try {
        await exchangeWechatTokenHash(data.data.tokenHash);
        observer?.({ stage: "verifyOtp", status: "success" });
      } catch (error) {
        observer?.({ stage: "verifyOtp", status: "error", ...await extractFunctionDiagnostics(error) });
        throw error;
      }

      observer?.({ stage: "getUser", status: "running" });
      let user: Awaited<ReturnType<typeof getCurrentUser>>;
      try {
        user = await getCurrentUser();
        if (!user) throw new Error("WeChat session verification failed");
        observer?.({ stage: "getUser", status: "success" });
      } catch (error) {
        observer?.({ stage: "getUser", status: "error", ...await extractFunctionDiagnostics(error) });
        throw error;
      }
      return user;
    })().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}
export async function getCurrentProfile() {
  const { data, error } = await getSupabaseClient().from("profiles").select("*").single();
  if (error) throw new Error("Profile request failed");
  return data;
}
export { restoreSession };
