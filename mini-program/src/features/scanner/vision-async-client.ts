export type VisionAsyncStatus = "processing" | "completed" | "failed" | "timed_out" | "cancelled";

export interface VisionAsyncResponse {
  status: VisionAsyncStatus;
  analysisId: string;
  currentStage?: string | null;
  result?: unknown;
  errorCode?: string | null;
  retryable?: boolean;
  deadlineAt?: string | null;
  expiresAt?: string | null;
}

export function normalizeVisionStatus(value: unknown): VisionAsyncResponse {
  if (!value || typeof value !== "object") throw new Error("VISION_STATUS_INVALID");
  const input = value as Record<string, unknown>;
  const rawStatus = String(input.status || "processing");
  const terminalStatuses: VisionAsyncStatus[] = ["completed", "failed", "timed_out", "cancelled"];
  const processingStatuses = ["created", "uploaded", "analyzing", "enriching", "persisting", "processing"];
  const status = (terminalStatuses.includes(rawStatus as VisionAsyncStatus) ? rawStatus : "processing") as VisionAsyncStatus;
  if ((!processingStatuses.includes(rawStatus) && !terminalStatuses.includes(rawStatus as VisionAsyncStatus))
    || typeof input.analysisId !== "string" || !input.analysisId) {
    throw new Error("VISION_STATUS_INVALID");
  }
  return {
    status,
    analysisId: input.analysisId,
    currentStage: typeof input.currentStage === "string"
      ? input.currentStage
      : processingStatuses.includes(rawStatus) && rawStatus !== "processing" ? rawStatus : null,
    result: input.result,
    errorCode: typeof input.errorCode === "string" ? input.errorCode : null,
    retryable: input.retryable === true,
    deadlineAt: typeof input.deadlineAt === "string" ? input.deadlineAt : null,
    expiresAt: typeof input.expiresAt === "string" ? input.expiresAt : null,
  };
}

export function isVisionTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "timed_out" || status === "cancelled";
}

export function isRetryableVisionStatusError(error: unknown): boolean {
  const name = error && typeof error === "object" && "name" in error
    ? String((error as { name?: unknown }).name ?? "")
    : "";
  return name === "VISION_STATUS_FAILED" || name === "VISION_NETWORK_ERROR";
}

export function nextVisionPollDelay(attempt: number): number {
  const normalizedAttempt = Math.max(0, Number(attempt) || 0);
  return Math.min(5000, Math.round(1500 * (1.5 ** normalizedAttempt)));
}
