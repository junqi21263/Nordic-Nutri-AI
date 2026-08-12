import type { FeedbackModalVariant } from "../../stores/feedback-store";

function errorText(error: unknown) {
  if (error instanceof Error) return `${error.name} ${error.message}`.toLowerCase();
  if (error && typeof error === "object") {
    const value = error as { name?: unknown; message?: unknown; code?: unknown; errorCode?: unknown };
    return [value.name, value.message, value.code, value.errorCode].filter(Boolean).join(" ").toLowerCase();
  }
  return String(error ?? "").toLowerCase();
}

/** Normalizes backend quota/rate-limit variants for the shared feedback surface. */
export function isFeedbackQuotaError(error: unknown) {
  const text = errorText(error);
  return (
    text.includes("daily_limit") ||
    text.includes("quota") ||
    text.includes("limit_reached") ||
    text.includes("额度") ||
    text.includes("次数已用完")
  );
}

export function feedbackVariantForError(error: unknown): FeedbackModalVariant {
  return isFeedbackQuotaError(error) ? "limit" : "error";
}
