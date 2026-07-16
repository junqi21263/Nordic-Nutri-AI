import { getCurrentProfile, loginWithWechat } from "../api/auth-api";
import { getPublicRuntimeConfig } from "../api/environment";
import { extractFunctionDiagnostics, truncateProjectRef, truncateUserId } from "../api/function-request-id";
import { getSupabaseClient } from "../lib/supabase-client";
import { getCurrentUser, refreshSession, restoreSession, signOut } from "../auth/session-manager";
import {
  createAuthHarnessSnapshot,
  type AuthHarnessSnapshot,
  type HarnessStep,
} from "./auth-harness-state";

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
          steps: { [event.stage]: event.status },
        });
      });
      this.update({ operationStatus: "success", sessionStatus: "authenticated", userId: truncateUserId(user?.id) });
    } catch (error) {
      if (this.snapshot.errorCode || this.snapshot.requestId || this.snapshot.httpStatus) this.fail(this.activeLoginStep);
      else await this.failRequest(error, this.activeLoginStep);
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
