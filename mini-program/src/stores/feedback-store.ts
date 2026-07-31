import { create } from "zustand";

export type FeedbackTone = "default" | "success" | "error";

export interface FeedbackMessage {
  message: string;
  tone?: FeedbackTone;
}

export interface FeedbackStore {
  toast: Required<FeedbackMessage> | null;
  show: (feedback: FeedbackMessage) => void;
  clear: () => void;
}

export type FeedbackToastPresenter = (feedback: Required<FeedbackMessage>) => void;

const feedbackToastDuration = 2400;

type NativeToastBridge = {
  showToast?: (options: { title: string; icon: "none"; duration: number }) => unknown;
};

/** Prefer native WeChat/Taro toast so secondary pages always surface feedback. */
export const presentNativeFeedbackToast: FeedbackToastPresenter = ({ message }) => {
  try {
    const globalBridge = globalThis as {
      wx?: NativeToastBridge;
      taro?: NativeToastBridge;
    };
    const showToast = globalBridge.wx?.showToast ?? globalBridge.taro?.showToast;
    if (typeof showToast === "function") {
      showToast({
        title: message,
        icon: "none",
        duration: feedbackToastDuration,
      });
      return;
    }
    void import("@tarojs/taro")
      .then((mod) => {
        const Taro = mod.default ?? mod;
        void Taro.showToast?.({
          title: message,
          icon: "none",
          duration: feedbackToastDuration,
        });
      })
      .catch(() => undefined);
  } catch {
    // Unit tests and non-mini-program hosts may not bridge showToast.
  }
};

export const createFeedbackStore = (
  presentToast: FeedbackToastPresenter = presentNativeFeedbackToast,
) =>
  create<FeedbackStore>((set) => ({
    toast: null,
    show: ({ message, tone = "default" }) => {
      const toast = { message, tone };
      set({ toast });
      presentToast(toast);
    },
    clear: () => set({ toast: null }),
  }));

export const useFeedbackStore = createFeedbackStore();
