import { create } from "zustand";

export type FeedbackTone = "default" | "success" | "error";
export type FeedbackPresentation = "native" | "prominent" | "status";
export type FeedbackModalVariant = "success" | "limit" | "error";

export interface FeedbackMessage {
  message: string;
  tone?: FeedbackTone;
  /** Chooses the in-app feedback surface when a short native notification would be hard to read. */
  presentation?: FeedbackPresentation;
}

export interface FeedbackModalOptions {
  variant: FeedbackModalVariant;
  presentation?: "recognition";
  title: string;
  description?: string;
  primaryText: string;
  secondaryText?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onClose?: () => void;
  dismissible?: boolean;
}

export interface FeedbackStore {
  toast: Required<FeedbackMessage> | null;
  modal: FeedbackModalOptions | null;
  show: (feedback: FeedbackMessage) => void;
  clear: () => void;
  showModal: (modal: FeedbackModalOptions) => void;
  closeModal: () => void;
}

export type FeedbackToastPresenter = (feedback: Required<FeedbackMessage>) => void;

const feedbackToastDuration = 2400;

type NativeToastBridge = {
  showToast?: (options: { title: string; icon: "none"; duration: number }) => unknown;
  hideToast?: () => unknown;
};

/** Prefer native WeChat/Taro toast so secondary pages always surface feedback. */
export const presentNativeFeedbackToast: FeedbackToastPresenter = ({ message, presentation }) => {
  if (presentation === "prominent" || presentation === "status") return;
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
    modal: null,
    show: ({ message, tone = "default", presentation = "native" }) => {
      const toast = { message, tone, presentation };
      let blockedByModal = false;
      set((state) => {
        blockedByModal = Boolean(state.modal);
        return blockedByModal ? { toast: null } : { toast };
      });
      if (!blockedByModal) presentToast(toast);
    },
    clear: () => set({ toast: null }),
    showModal: (modal) => {
      set({ modal, toast: null });
      try {
        const globalBridge = globalThis as { wx?: NativeToastBridge; taro?: NativeToastBridge };
        const hideToast = globalBridge.wx?.hideToast ?? globalBridge.taro?.hideToast;
        if (typeof hideToast === "function") hideToast();
      } catch {
        // Native toast dismissal is best-effort outside the WeChat runtime.
      }
    },
    closeModal: () => set({ modal: null }),
  }));

export const useFeedbackStore = createFeedbackStore();
