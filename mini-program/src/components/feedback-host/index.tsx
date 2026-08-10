import { useEffect } from "react";
import { Toast } from "../toast";
import { useFeedbackStore } from "../../stores/feedback-store";

const feedbackDuration = 2400;

function hasNativeToastBridge() {
  const bridge = globalThis as { wx?: { showToast?: unknown } };
  return typeof bridge.wx?.showToast === "function";
}

/** Custom toast when native wx.showToast is unavailable; WeChat uses the store bridge. */
export function FeedbackHost() {
  const toast = useFeedbackStore((state) => state.toast);
  const clear = useFeedbackStore((state) => state.clear);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(clear, feedbackDuration);
    return () => clearTimeout(timer);
  }, [toast, clear]);

  if (!toast || (hasNativeToastBridge() && toast.presentation !== "prominent")) return null;
  return <Toast message={toast.message} tone={toast.tone} presentation={toast.presentation} />;
}
