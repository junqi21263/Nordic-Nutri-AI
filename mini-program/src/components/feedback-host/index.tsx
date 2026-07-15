import { useEffect } from "react";
import { Toast } from "../toast";
import { useFeedbackStore } from "../../stores/feedback-store";

const feedbackDuration = 2400;

export function FeedbackHost() {
  const toast = useFeedbackStore((state) => state.toast);
  const clear = useFeedbackStore((state) => state.clear);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(clear, feedbackDuration);
    return () => clearTimeout(timer);
  }, [toast, clear]);

  return toast ? <Toast message={toast.message} tone={toast.tone} /> : null;
}
