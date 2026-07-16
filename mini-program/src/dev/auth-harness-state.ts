import type { AuthStorageInspection } from "../lib/wechat-storage";
import type { WechatUrlCompatibilityDiagnostics } from "../lib/wechat-url";
import {
  createInitializationMatrix,
  type InitializationProbeEntry,
  type InitializationProbeStep,
} from "./supabase-initialization-probe";

export type HarnessStep =
  | "configCheck"
  | "wxLogin"
  | "functionInvokeStart"
  | "functionInvokeResponse"
  | "functionErrorParse"
  | "verifyOtp"
  | "getUser"
  | "profileFetch"
  | "userSettings"
  | "activeMeals"
  | "saveMeal";
export type HarnessStatus = "idle" | "running" | "success" | "error";
export type SessionStatus = "unknown" | "none" | "anonymous" | "authenticated";

export interface AuthHarnessSnapshot {
  requestId: string | null;
  httpStatus: number | null;
  errorCode: string | null;
  message: string | null;
  errorName: string | null;
  errorKind: string | null;
  initializationStage: string | null;
  causeName: string | null;
  causeMessage: string | null;
  missingCapability: string | null;
  rawErrorName: string | null;
  rawErrorMessage: string | null;
  rawCauseName: string | null;
  rawCauseMessage: string | null;
  stackFrames: string[];
  errorFile: string | null;
  errorFunction: string | null;
  initializationMatrix: Record<InitializationProbeStep, InitializationProbeEntry>;
  supabaseClientInstanceCount: number;
  authStorageInspection: AuthStorageInspection;
  urlCompatibility: WechatUrlCompatibilityDiagnostics | null;
  currentStage: HarnessStep | null;
  userId: string | null;
  sessionStatus: SessionStatus;
  operationStatus: HarnessStatus;
  steps: Record<HarnessStep, HarnessStatus>;
}

export function createAuthHarnessSnapshot(): AuthHarnessSnapshot {
  return {
    requestId: null,
    httpStatus: null,
    errorCode: null,
    message: null,
    errorName: null,
    errorKind: null,
    initializationStage: null,
    causeName: null,
    causeMessage: null,
    missingCapability: null,
    rawErrorName: null,
    rawErrorMessage: null,
    rawCauseName: null,
    rawCauseMessage: null,
    stackFrames: [],
    errorFile: null,
    errorFunction: null,
    initializationMatrix: createInitializationMatrix(),
    supabaseClientInstanceCount: 0,
    authStorageInspection: { valueExists: false, valueType: "none", jsonParseSucceeded: false, hasAccessToken: false, hasRefreshToken: false, shouldClear: false },
    urlCompatibility: null,
    currentStage: null,
    userId: null,
    sessionStatus: "unknown",
    operationStatus: "idle",
    steps: {
      configCheck: "idle",
      wxLogin: "idle",
      functionInvokeStart: "idle",
      functionInvokeResponse: "idle",
      functionErrorParse: "idle",
      verifyOtp: "idle",
      getUser: "idle",
      profileFetch: "idle",
      userSettings: "idle",
      activeMeals: "idle",
      saveMeal: "idle",
    },
  };
}
