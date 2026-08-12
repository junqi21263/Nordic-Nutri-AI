import { describe, expect, it, afterEach } from "vitest";
import {
  minimumPlanProcessingMs,
  nextPlanRegenerationState,
  planReadyMotion,
  planGenerationRequestTimeoutMs,
  stitchInitialProcessingMotion,
} from "../src/features/onboarding/plan-regeneration-motion";
import { usePlanRegenerationStore } from "../src/stores/plan-regeneration-store";

const preview = {
  calories: 2450,
  proteinG: 150,
  carbsG: 280,
  fatG: 82,
  insight: "保持稳定节奏。",
  source: "formula" as const,
};

afterEach(() => usePlanRegenerationStore.getState().reset());

describe("plan regeneration motion state", () => {
  it("moves through the single regeneration state machine and ignores duplicate starts", () => {
    const store = usePlanRegenerationStore.getState();

    expect(store.start()).toBe(true);
    expect(store.start()).toBe(false);
    expect(usePlanRegenerationStore.getState().state).toBe("processing");

    usePlanRegenerationStore.getState().succeed(preview);
    expect(usePlanRegenerationStore.getState()).toMatchObject({
      state: "completing",
      preview,
    });

    usePlanRegenerationStore.getState().navigate();
    expect(usePlanRegenerationStore.getState()).toMatchObject({ state: "navigating", preview });
    usePlanRegenerationStore.getState().reveal();
    expect(usePlanRegenerationStore.getState().state).toBe("revealing");
    usePlanRegenerationStore.getState().finish();
    expect(usePlanRegenerationStore.getState()).toMatchObject({ state: "ready", preview: null });
    expect(usePlanRegenerationStore.getState().start()).toBe(true);
    expect(usePlanRegenerationStore.getState().state).toBe("processing");
  });

  it("does not allow invalid state jumps and uses the agreed motion windows", () => {
    expect(nextPlanRegenerationState("idle", "succeed")).toBe("idle");
    expect(nextPlanRegenerationState("processing", "succeed")).toBe("completing");
    expect(nextPlanRegenerationState("completing", "navigate")).toBe("navigating");
    expect(nextPlanRegenerationState("navigating", "reveal")).toBe("revealing");
    expect(nextPlanRegenerationState("revealing", "finish")).toBe("ready");
    expect(minimumPlanProcessingMs).toBe(stitchInitialProcessingMotion.completingAtMs);
    expect(stitchInitialProcessingMotion).toMatchObject({
      particleGatheringMs: 1200,
      fatStartMs: 1200,
      carbsStartMs: 1600,
      proteinStartMs: 2000,
      ringDrawDurationMs: 800,
      completingAtMs: 3000,
    });
    expect(planReadyMotion).toMatchObject({
      completingDurationMs: 800,
      resultItemDurationMs: 600,
      resultItemStaggerMs: 100,
      calorieDelayMs: 500,
      calorieDurationMs: 1500,
      enterDurationMs: 2000,
    });
  });

  it("keeps the completed preview through navigation, then releases it after the result entrance", () => {
    const store = usePlanRegenerationStore.getState();
    store.start();
    usePlanRegenerationStore.getState().succeed(preview);
    usePlanRegenerationStore.getState().navigate();

    expect(usePlanRegenerationStore.getState()).toMatchObject({ state: "navigating", preview });
    usePlanRegenerationStore.getState().reveal();
    expect(usePlanRegenerationStore.getState()).toMatchObject({ state: "revealing", preview });
    usePlanRegenerationStore.getState().finish();
    expect(usePlanRegenerationStore.getState()).toMatchObject({ state: "ready", preview: null });
  });

  it("bounds a stalled generation request so the button can recover", () => {
    expect(planGenerationRequestTimeoutMs).toBe(15000);
  });
});
