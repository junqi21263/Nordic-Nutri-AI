import { describe, expect, it, afterEach } from "vitest";
import { usePlanSaveTransitionStore } from "../src/stores/plan-save-transition-store";

afterEach(() => usePlanSaveTransitionStore.getState().reset());

describe("plan save to home transition", () => {
  it("keeps the handoff active from success through the home curtain fade", () => {
    const store = usePlanSaveTransitionStore.getState();

    store.succeed();
    expect(usePlanSaveTransitionStore.getState()).toMatchObject({ phase: "success", handoffActive: true });
    usePlanSaveTransitionStore.getState().cover();
    expect(usePlanSaveTransitionStore.getState()).toMatchObject({ phase: "covering", handoffActive: true });
    usePlanSaveTransitionStore.getState().reveal();
    expect(usePlanSaveTransitionStore.getState()).toMatchObject({ phase: "revealing", handoffActive: true });
    usePlanSaveTransitionStore.getState().finish();
    expect(usePlanSaveTransitionStore.getState()).toMatchObject({ phase: "idle", handoffActive: false });
  });
});
