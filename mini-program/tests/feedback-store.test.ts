import { describe, expect, it, vi } from "vitest";
import { createFeedbackStore } from "../src/stores/feedback-store";

describe("feedback store modal channel", () => {
  it("stores a modal and clears any toast while opening it", () => {
    const store = createFeedbackStore(() => undefined);
    store.getState().show({ message: "旧提示", tone: "success" });

    store.getState().showModal({
      variant: "success",
      title: "保存成功",
      description: "修改已保存。",
      primaryText: "知道了",
    });

    expect(store.getState().toast).toBeNull();
    expect(store.getState().modal).toMatchObject({
      variant: "success",
      title: "保存成功",
      primaryText: "知道了",
    });
  });

  it("closes the active modal", () => {
    const store = createFeedbackStore(() => undefined);
    store.getState().showModal({ variant: "limit", title: "今日已达到上限", primaryText: "知道了" });

    store.getState().closeModal();

    expect(store.getState().modal).toBeNull();
  });

  it("does not present a toast while a modal is open", () => {
    const presentToast = vi.fn();
    const store = createFeedbackStore(presentToast);
    store.getState().showModal({ variant: "error", title: "失败", primaryText: "知道了" });

    store.getState().show({ message: "不应显示" });

    expect(presentToast).not.toHaveBeenCalled();
    expect(store.getState().toast).toBeNull();
  });
});
