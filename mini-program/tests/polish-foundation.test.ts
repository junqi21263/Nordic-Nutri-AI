import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createFeedbackStore } from "../src/stores/feedback-store";
import { createMealFixtures } from "../src/features/meals/domain";
import { createPortionDraftStore } from "../src/stores/portion-draft-store";
import { shouldNavigateBack } from "../src/utils/navigation-intent";

const source = resolve(import.meta.dirname, "..", "src");
const read = (path: string) => readFileSync(resolve(source, path), "utf8");

describe("MVP polish foundation", () => {
  it("queues and clears local feedback without a network dependency", () => {
    const store = createFeedbackStore();
    store.getState().show({ message: "已保存到本地记录", tone: "success" });
    expect(store.getState().toast).toMatchObject({ message: "已保存到本地记录", tone: "success" });
    store.getState().clear();
    expect(store.getState().toast).toBeNull();
  });

  it("opens an existing meal as an editable portion draft and retains its id", () => {
    const meal = createMealFixtures("2026-07-13")[0]!;
    const store = createPortionDraftStore();
    store.getState().startMealEdit(meal);
    expect(store.getState().editingMealId).toBe(meal.id);
    expect(store.getState().getAdjusted()?.items).toHaveLength(meal.items.length);
  });

  it("keeps direct-entry back actions inside the mini-program", () => {
    expect(shouldNavigateBack(1)).toBe(false);
    expect(shouldNavigateBack(2)).toBe(true);
  });

  it("keeps the shared UI system motion-safe and accessibility-ready", () => {
    const tokens = read("styles/tokens.scss");
    const components = read("styles/components.scss");
    const navigation = read("components/app-header/index.tsx");
    const layout = read("layouts/page-layout/index.tsx");
    expect(tokens).toContain("$duration-page");
    expect(components).not.toContain("prefers-reduced-motion");
    expect(components).toContain(".app-button:active");
    expect(navigation).toContain("ariaLabel");
    expect(layout).toContain("page-layout__content");
  });

  it("uses the local dialog system for destructive meal confirmation", () => {
    expect(existsSync(resolve(source, "components", "confirm-dialog", "index.tsx"))).toBe(true);
    const detail = read("pages/meal-detail/index.tsx");
    expect(detail).toContain("ConfirmDialog");
    expect(detail).not.toContain("Taro.showModal");
  });
});
