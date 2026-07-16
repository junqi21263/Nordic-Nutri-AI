import { getCurrentProfile, loginWithWechat } from "../api/auth-api";
import { getPublicRuntimeConfig } from "../api/environment";
import { extractFunctionDiagnostics, truncateProjectRef, truncateUserId } from "../api/function-request-id";
import {
  clearSupabaseAuthCache,
  getSupabaseClient,
  getSupabaseClientInstanceCount,
  inspectSupabaseAuthCache,
  wechatStorage,
} from "../lib/supabase-client";
import { getWechatFetch, installWechatHeadersCompat } from "../lib/wechat-fetch";
import { getWechatUrlCompatibilityDiagnostics, installWechatUrlCompatibility } from "../lib/wechat-url";
import { useAuthStore } from "../auth/auth-store";
import { getCurrentUser, refreshSession, restoreSession, signOut } from "../auth/session-manager";
import {
  createAuthHarnessSnapshot,
  type AuthHarnessSnapshot,
  type HarnessStep,
} from "./auth-harness-state";
import {
  probeSupabaseInitialization,
  type InitializationProbeStep,
} from "./supabase-initialization-probe";
export { getAuthHarnessRuntimeDiagnostics } from "./runtime-diagnostics";

const loginSteps: HarnessStep[] = [
  "configCheck",
  "wxLogin",
  "functionInvokeStart",
  "functionInvokeResponse",
  "functionErrorParse",
  "verifyOtp",
  "getUser",
];

export interface AuthHarnessConfigDiagnostics {
  supabaseUrlConfigured: boolean;
  supabaseProjectRef: string | null;
  publishableKeyConfigured: boolean;
  realAuthEnabled: boolean;
  realBackendEnabled: boolean;
  runtimeEnv: string;
}

export function getAuthHarnessConfigDiagnostics(): AuthHarnessConfigDiagnostics {
  const config = getPublicRuntimeConfig();
  return {
    supabaseUrlConfigured: Boolean(config.supabaseUrl),
    supabaseProjectRef: truncateProjectRef(config.supabaseUrl),
    publishableKeyConfigured: Boolean(config.supabasePublishableKey),
    realAuthEnabled: config.enableRealAuth,
    realBackendEnabled: config.useRealBackend,
    runtimeEnv: config.environment,
  };
}

function assertDevelopmentAuthHarness(): void {
  const config = getPublicRuntimeConfig();
  if (config.environment !== "development" || !config.enableRealAuth) {
    throw new Error("Development authentication harness is disabled");
  }
}

function buildSaveMealInput() {
  return {
    clientRequestId: crypto.randomUUID(),
    name: "Development auth harness meal",
    mealType: "snack",
    recordedAt: new Date().toISOString(),
    items: [
      {
        name: "Development item A",
        confirmedQuantityG: 100,
        caloriesPer100g: 100,
        proteinGPer100g: 10,
        carbsGPer100g: 10,
        fatGPer100g: 2,
      },
      {
        name: "Development item B",
        confirmedQuantityG: 50,
        caloriesPer100g: 80,
        proteinGPer100g: 5,
        carbsGPer100g: 12,
        fatGPer100g: 1,
      },
    ],
  };
}

export class DevelopmentAuthHarness {
  private snapshot = createAuthHarnessSnapshot();
  private activeLoginStep: HarnessStep = "configCheck";

  constructor(private readonly onChange: (snapshot: AuthHarnessSnapshot) => void) {}

  private publish(next: AuthHarnessSnapshot): void {
    this.snapshot = next;
    this.onChange(next);
  }

  private update(patch: Partial<Omit<AuthHarnessSnapshot, "steps">> & { steps?: Partial<AuthHarnessSnapshot["steps"]> }): void {
    this.publish({
      ...this.snapshot,
      ...patch,
      steps: { ...this.snapshot.steps, ...patch.steps },
    });
  }

  private begin(step?: HarnessStep): void {
    assertDevelopmentAuthHarness();
    this.update({
      operationStatus: "running",
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
      currentStage: step ?? null,
      ...(step ? { steps: { [step]: "running" } } : {}),
    });
  }

  private complete(step?: HarnessStep): void {
    this.update({ operationStatus: "success", ...(step ? { currentStage: step, steps: { [step]: "success" } } : {}) });
  }

  private fail(step?: HarnessStep): void {
    this.update({ operationStatus: "error", ...(step ? { currentStage: step, steps: { [step]: "error" } } : {}) });
  }

  private async failRequest(error: unknown, step?: HarnessStep): Promise<void> {
    this.update({ currentStage: step ?? null, ...await extractFunctionDiagnostics(error) });
    this.fail(step);
  }

  async login(): Promise<void> {
    try {
      this.activeLoginStep = "configCheck";
      this.begin("configCheck");
      this.update({ steps: Object.fromEntries(loginSteps.map((step) => [step, "idle"])) as Partial<AuthHarnessSnapshot["steps"]> });
      this.complete("configCheck");
      const user = await loginWithWechat((event) => {
        if (event.status === "running") this.activeLoginStep = event.stage;
        this.update({
          currentStage: event.stage,
          ...(event.requestId !== undefined ? { requestId: event.requestId } : {}),
          ...(event.httpStatus !== undefined ? { httpStatus: event.httpStatus } : {}),
          ...(event.errorCode !== undefined ? { errorCode: event.errorCode } : {}),
          ...(event.message !== undefined ? { message: event.message } : {}),
          ...(event.errorName !== undefined ? { errorName: event.errorName } : {}),
          ...(event.errorKind !== undefined ? { errorKind: event.errorKind } : {}),
          ...(event.initializationStage !== undefined ? { initializationStage: event.initializationStage } : {}),
          ...(event.causeName !== undefined ? { causeName: event.causeName } : {}),
          ...(event.causeMessage !== undefined ? { causeMessage: event.causeMessage } : {}),
          ...(event.missingCapability !== undefined ? { missingCapability: event.missingCapability } : {}),
          ...(event.rawErrorName !== undefined ? { rawErrorName: event.rawErrorName } : {}),
          ...(event.rawErrorMessage !== undefined ? { rawErrorMessage: event.rawErrorMessage } : {}),
          ...(event.rawCauseName !== undefined ? { rawCauseName: event.rawCauseName } : {}),
          ...(event.rawCauseMessage !== undefined ? { rawCauseMessage: event.rawCauseMessage } : {}),
          ...(event.stackFrames !== undefined ? { stackFrames: event.stackFrames } : {}),
          ...(event.errorFile !== undefined ? { errorFile: event.errorFile } : {}),
          ...(event.errorFunction !== undefined ? { errorFunction: event.errorFunction } : {}),
          steps: { [event.stage]: event.status },
        });
      });
      this.update({ operationStatus: "success", sessionStatus: "authenticated", userId: truncateUserId(user?.id) });
    } catch (error) {
      if (this.snapshot.errorCode || this.snapshot.requestId || this.snapshot.httpStatus) this.fail(this.activeLoginStep);
      else await this.failRequest(error, this.activeLoginStep);
    }
  }

  async runInitializationProbe(): Promise<void> {
    try {
      this.begin();
      installWechatHeadersCompat();
      installWechatUrlCompatibility();
      const initializationMatrix = await probeSupabaseInitialization({
        config: getPublicRuntimeConfig(),
        fetch: getWechatFetch(getPublicRuntimeConfig().supabaseUrl),
        storage: wechatStorage,
        getFullClient: getSupabaseClient,
      });
      const firstFailure = (Object.keys(initializationMatrix) as InitializationProbeStep[])
        .map((step) => initializationMatrix[step])
        .find((result) => result.status === "error");
      this.update({
        initializationMatrix,
        supabaseClientInstanceCount: getSupabaseClientInstanceCount(),
        authStorageInspection: inspectSupabaseAuthCache(),
        urlCompatibility: getWechatUrlCompatibilityDiagnostics(),
        ...(firstFailure?.error ? {
          rawErrorName: firstFailure.error.rawErrorName,
          rawErrorMessage: firstFailure.error.rawErrorMessage,
          rawCauseName: firstFailure.error.rawCauseName,
          rawCauseMessage: firstFailure.error.rawCauseMessage,
          stackFrames: firstFailure.error.stackFrames,
          errorFile: firstFailure.error.errorFile,
          errorFunction: firstFailure.error.errorFunction,
        } : {}),
      });
      if (firstFailure) this.fail(); else this.complete();
    } catch (error) {
      await this.failRequest(error);
    }
  }

  async getSessionStatus(): Promise<void> {
    try {
      this.begin();
      const session = await restoreSession();
      this.update({
        operationStatus: "success",
        sessionStatus: session ? "authenticated" : "anonymous",
        userId: truncateUserId(session?.user.id),
      });
    } catch (error) {
      await this.failRequest(error);
      this.update({ sessionStatus: "anonymous", userId: null });
    }
  }

  async refresh(): Promise<void> {
    try {
      this.begin();
      const session = await refreshSession();
      if (!session) throw new Error("No session to refresh");
      this.update({ operationStatus: "success", sessionStatus: "authenticated", userId: truncateUserId(session.user.id) });
    } catch (error) {
      await this.failRequest(error);
      this.update({ sessionStatus: "anonymous", userId: null });
    }
  }

  async profile(): Promise<void> {
    try {
      this.begin("profileFetch");
      await getCurrentProfile();
      this.complete("profileFetch");
    } catch (error) {
      await this.failRequest(error, "profileFetch");
    }
  }

  async userSettings(): Promise<void> {
    try {
      this.begin("userSettings");
      const { error } = await getSupabaseClient().from("user_settings").select("id").single();
      if (error) throw error;
      this.complete("userSettings");
    } catch (error) {
      await this.failRequest(error, "userSettings");
    }
  }

  async activeMeals(): Promise<void> {
    try {
      this.begin("activeMeals");
      const { error } = await getSupabaseClient().from("active_meal_records").select("id").limit(1);
      if (error) throw error;
      this.complete("activeMeals");
    } catch (error) {
      await this.failRequest(error, "activeMeals");
    }
  }

  async saveMeal(): Promise<void> {
    try {
      this.begin("saveMeal");
      if (getPublicRuntimeConfig().environment === "development") {
        console.info("[dev-auth] function-invoke-started", {
          targetProjectRef: truncateProjectRef(getPublicRuntimeConfig().supabaseUrl),
          httpStatus: null,
          requestId: null,
        });
      }
      const { data, error, response } = await getSupabaseClient().functions.invoke<{
        success: boolean;
        requestId?: string;
      }>("save-meal", { body: buildSaveMealInput() });
      if (error || !data?.success) throw new Error("Save meal test failed");
      this.update({
        requestId: data.requestId ?? response?.headers.get("x-request-id") ?? null,
        httpStatus: response?.status ?? null,
      });
      if (getPublicRuntimeConfig().environment === "development") {
        console.info("[dev-auth] function-invoke-completed", {
          targetProjectRef: truncateProjectRef(getPublicRuntimeConfig().supabaseUrl),
          httpStatus: response?.status ?? null,
          requestId: data.requestId ?? response?.headers.get("x-request-id") ?? null,
        });
      }
      this.complete("saveMeal");
    } catch (error) {
      const diagnostics = await extractFunctionDiagnostics(error);
      if (getPublicRuntimeConfig().environment === "development") {
        console.info("[dev-auth] function-invoke-failed", {
          targetProjectRef: truncateProjectRef(getPublicRuntimeConfig().supabaseUrl),
          httpStatus: diagnostics.httpStatus,
          requestId: diagnostics.requestId,
        });
      }
      this.update({ currentStage: "saveMeal", ...diagnostics });
      this.fail("saveMeal");
    }
  }

  async logout(): Promise<void> {
    try {
      assertDevelopmentAuthHarness();
      await signOut();
      this.update({ operationStatus: "success", sessionStatus: "anonymous", userId: null });
    } catch (error) {
      await this.failRequest(error);
    }
  }

  async clearAuthenticationCache(): Promise<void> {
    try {
      this.begin();
      if (!clearSupabaseAuthCache()) throw new Error("Authentication storage key is unavailable");
      useAuthStore.getState().clear();
      this.update({ sessionStatus: "none", userId: null, authStorageInspection: inspectSupabaseAuthCache() });
      this.complete();
    } catch (error) {
      await this.failRequest(error);
    }
  }

  async currentUser(): Promise<void> {
    try {
      this.begin("getUser");
      const user = await getCurrentUser();
      if (!user) throw new Error("No authenticated user");
      this.update({ userId: truncateUserId(user.id) });
      this.complete("getUser");
    } catch (error) {
      await this.failRequest(error, "getUser");
    }
  }
}
