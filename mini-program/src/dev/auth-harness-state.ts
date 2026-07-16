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
export type SessionStatus = "unknown" | "anonymous" | "authenticated";

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
