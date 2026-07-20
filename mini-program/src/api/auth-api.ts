import Taro from "@tarojs/taro";
import { extractFunctionDiagnostics, truncateProjectRef } from "./function-request-id";
import { getPublicRuntimeConfig } from "./environment";
import { requestCloudbaseLoginTicket } from "./cloudbase-ticket-api";
import { createCloudbaseTicketLogin } from "../auth/cloudbase-ticket-login";
import type { AppAuthUser } from "../auth/auth-store";
import { getCloudbaseAuth } from "../lib/cloudbase";
import {
  assertCloudbaseSignInSucceeded,
  readCloudbaseSessionCredentials,
} from "../auth/cloudbase-session";
import { restoreSession } from "../auth/session-manager";

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

function summarizeCloudbaseLoginError(error: unknown): {
  errorName: string | null;
  errorCode: string | null;
  message: string | null;
} {
  if (error instanceof Error) {
    const value = error as Error & { code?: unknown };
    return {
      errorName: error.name || null,
      errorCode: typeof value.code === "string" ? value.code : null,
      message: error.message || null,
    };
  }

  if (error && typeof error === "object") {
    const value = error as { name?: unknown; code?: unknown; message?: unknown };
    return {
      errorName: typeof value.name === "string" ? value.name : null,
      errorCode: typeof value.code === "string" ? value.code : null,
      message: typeof value.message === "string" ? value.message : null,
    };
  }

  return { errorName: null, errorCode: null, message: null };
}

function logCloudbaseLoginFailure(
  error: unknown,
  diagnostics: { httpStatus?: number | null; requestId?: string | null },
): void {
  if (getPublicRuntimeConfig().environment !== "development") return;
  const summary = summarizeCloudbaseLoginError(error);
  console.error("[dev-auth] cloudbase-login-failed", {
    ...summary,
    httpStatus: diagnostics.httpStatus ?? null,
    requestId: diagnostics.requestId ?? null,
  });
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
      const signIn = createCloudbaseTicketLogin({
        wxLogin: async () => login,
        requestTicket: requestCloudbaseLoginTicket,
        signInWithCustomTicket: async (ticket) => {
          const auth = getCloudbaseAuth();
          const result = await auth.signInWithCustomTicket(async () => ticket);
          assertCloudbaseSignInSucceeded(result);
          const credentials = readCloudbaseSessionCredentials(result);
          if (!credentials) throw new Error("CloudBase 登录会话凭证缺失");
          const reboundSession = await auth.setSession(credentials);
          assertCloudbaseSignInSucceeded(reboundSession);
          if (!readCloudbaseSessionCredentials(reboundSession)) {
            throw new Error("CloudBase 登录会话未绑定到当前客户端");
          }
          const user = (await restoreSession())?.user ?? null;
          if (!user) throw new Error("CloudBase session verification failed");
          return { session: { user }, user };
        },
      });
      try {
        const signedIn = await signIn();
        observer?.({ stage: "functionInvokeResponse", status: "success" });
        logFunctionEvent("completed");
        observer?.({ stage: "verifyOtp", status: "success" });
        observer?.({ stage: "getUser", status: "success" });
        return signedIn.user;
      } catch (error) {
        const diagnostics = await extractFunctionDiagnostics(error);
        const summary = summarizeCloudbaseLoginError(error);
        observer?.({
          stage: "functionInvokeResponse",
          status: "error",
          ...diagnostics,
          errorName: summary.errorName ?? diagnostics.errorName,
          errorCode: summary.errorCode ?? diagnostics.errorCode,
          message: summary.message ?? diagnostics.message,
        });
        observer?.({ stage: "functionErrorParse", status: "success", ...diagnostics });
        logCloudbaseLoginFailure(error, diagnostics);
        logFunctionEvent("failed", diagnostics);
        observer?.({ stage: "verifyOtp", status: "error", ...diagnostics });
        observer?.({ stage: "getUser", status: "error", ...diagnostics });
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
