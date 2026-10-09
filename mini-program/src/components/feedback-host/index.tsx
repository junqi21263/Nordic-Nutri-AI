import { useEffect } from "react";
import { Toast } from "../toast";
import { FeedbackModal } from "../feedback-modal";
import { useFeedbackStore } from "../../stores/feedback-store";

const feedbackDuration = 2400;

function hasNativeToastBridge() {
  const bridge = globalThis as { wx?: { showToast?: unknown } };
  return typeof bridge.wx?.showToast === "function";
}

/** Custom toast when native wx.showToast is unavailable; WeChat uses the store bridge. */
export function FeedbackHost({ enabled = true }: { enabled?: boolean }) {
  const toast = useFeedbackStore((state) => state.toast);
  const modal = useFeedbackStore((state) => state.modal);
  const clear = useFeedbackStore((state) => state.clear);
  const closeModal = useFeedbackStore((state) => state.closeModal);

  // A modal is the richer feedback surface. Never let a late toast render above it.
  useEffect(() => {
    if (modal && toast) clear();
  }, [modal, toast, clear]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(clear, toast.presentation === "status" ? 1700 : feedbackDuration);
    return () => clearTimeout(timer);
  }, [toast, clear]);

  // PageLayout can stay mounted while tab pages switch. Only the visible page
  // may own the shared overlay, otherwise the same modal would render twice.
  if (!enabled) return null;
  if (modal) return <FeedbackModal modal={modal} onDismiss={closeModal} />;
  if (!toast || (hasNativeToastBridge() && toast.presentation !== "prominent" && toast.presentation !== "status")) return null;
  return <Toast message={toast.message} tone={toast.tone} presentation={toast.presentation} />;
}
