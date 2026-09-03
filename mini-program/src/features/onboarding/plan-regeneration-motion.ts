export type PlanRegenerationState =
  | "idle"
  | "processing"
  | "completing"
  | "navigating"
  | "revealing"
  | "ready"
  | "error";

export type PlanRegenerationEvent =
  | "start"
  | "succeed"
  | "navigate"
  | "reveal"
  | "finish"
  | "fail"
  | "reset";

// Calibrated from the Stitch prototype's `startGeneration` timeline.
// These are elapsed from the moment the processing overlay becomes visible.
export const stitchInitialProcessingMotion = {
  buttonPressMs: 300,
  acknowledgementMs: 750,
  overlayFadeInMs: 500,
  particleGatheringMs: 1200,
  fatStartMs: 1200,
  carbsStartMs: 1600,
  proteinStartMs: 2000,
  ringDrawDurationMs: 800,
  completingAtMs: 3000,
  checkHoldMs: 800,
  routeTransitionMs: 800,
  routeSettleMs: 400,
} as const;

export const minimumPlanProcessingMs = stitchInitialProcessingMotion.completingAtMs;
// Keep the client-side guard longer than the backend model route timeout so
// the mini program does not abort a valid but slower production request.
export const planGenerationRequestTimeoutMs = 35_000;

export function withPlanGenerationTimeout<T>(request: Promise<T>, timeoutMs = planGenerationRequestTimeoutMs): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("生成计划超时，请重试")), timeoutMs);
    request.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch((error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
export const planReadyMotion = {
  completingDurationMs: stitchInitialProcessingMotion.checkHoldMs,
  resultItemDurationMs: 600,
  resultItemStaggerMs: 100,
  calorieDelayMs: 500,
  calorieDurationMs: 1500,
  enterDurationMs: 2000,
} as const;

export function nextPlanRegenerationState(state: PlanRegenerationState, event: PlanRegenerationEvent): PlanRegenerationState {
  if (event === "reset") return "idle";
  if (state === "idle" && event === "start") return "processing";
  if (state === "processing" && event === "succeed") return "completing";
  if (state === "processing" && event === "fail") return "error";
  if (state === "completing" && event === "navigate") return "navigating";
  if (state === "navigating" && event === "reveal") return "revealing";
  if (state === "revealing" && event === "finish") return "ready";
  return state;
}
