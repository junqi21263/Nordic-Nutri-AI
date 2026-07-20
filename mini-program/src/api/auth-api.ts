import Taro from "@tarojs/taro";
import { extractFunctionDiagnostics, truncateProjectRef } from "./function-request-id";
import { getPublicRuntimeConfig } from "./environment";
import type { AppAuthUser } from "../auth/auth-store";
import { requestWechatHttpsLogin } from "./wechat-https-login-api";
import { restoreSession, setNativeSession } from "../auth/session-manager";

let loginInFlight: Promise<AppAuthUser> | null = null;

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
  rawErrorName?: string | null;
  rawErrorMessage?: string | null;
  rawCauseName?: string | null;
  rawCauseMessage?: string | null;
  stackFrames?: string[];
  errorFile?: string | null;
  errorFunction?: string | null;
}) => void;

function logFunctionEvent(event: "started" | "completed" | "failed", diagnostics?: {
  httpStatus?: number | null;
  requestId?: string | null;
}): void {
  if (getPublicRuntimeConfig().environment !== "development") return;
  console.info("[dev-auth] function-invoke-" + event, {
    targetProjectRef: truncateProjectRef("https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com"),
    httpStatus: diagnostics?.httpStatus ?? null,
    requestId: diagnostics?.requestId ?? null,
  });
}

export async function loginWithWechat(observer?: WechatLoginObserver) {
  if (!loginInFlight) {
    loginInFlight = (async () => {
      observer?.({ stage: "wxLogin", status: "running" });
      const wxLoginResult = await Taro.login();
      if (!wxLoginResult.code) throw new Error("微信未返回登录凭证");
      observer?.({ stage: "wxLogin", status: "success" });

      observer?.({ stage: "functionInvokeStart", status: "running" });
      logFunctionEvent("started");
      try {
        const login = await requestWechatHttpsLogin(wxLoginResult.code);
        const user = login.user;
        setNativeSession(user, login.session.accessToken);
        observer?.({ stage: "functionInvokeResponse", status: "success" });
        logFunctionEvent("completed");
        observer?.({ stage: "verifyOtp", status: "running" });
        observer?.({ stage: "verifyOtp", status: "success" });
        observer?.({ stage: "getUser", status: "success" });
        return user;
      } catch (error) {
        const diagnostics = await extractFunctionDiagnostics(error);
        observer?.({ stage: "functionInvokeResponse", status: "error", ...diagnostics });
        observer?.({ stage: "functionErrorParse", status: "success", ...diagnostics });
        observer?.({ stage: "verifyOtp", status: "error", ...diagnostics });
        observer?.({ stage: "getUser", status: "error", ...diagnostics });
        logFunctionEvent("failed", diagnostics);
        throw error;
      }
    })().finally(() => { loginInFlight = null; });
  }
  return loginInFlight;
}

export async function getCurrentProfile() {
  throw new Error("CloudBase profile bootstrap is not deployed");
}

export { restoreSession };
