import type {
  RecognitionFeedbackType,
  RecognitionResultSnapshot,
} from "../features/recognition-feedback/domain";
import { requestProductApi } from "./product-api-client";

export interface CreateRecognitionFeedbackInput {
  analysisId?: string | null;
  mealId?: string | null;
  feedbackType: RecognitionFeedbackType;
  originalResult: RecognitionResultSnapshot;
  correctedResult?: RecognitionResultSnapshot | null;
  note?: string | null;
}

export interface UpdateRecognitionFeedbackInput {
  mealId?: string | null;
  correctedResult?: RecognitionResultSnapshot | null;
  note?: string | null;
}

export function createRecognitionFeedback(input: CreateRecognitionFeedbackInput) {
  return requestProductApi<{ feedbackId: string }>("/recognition-feedback", {
    method: "POST",
    data: input as unknown as Record<string, unknown>,
    fallbackMessage: "纠错反馈暂时无法同步",
    timeout: 8_000,
  });
}

export function updateRecognitionFeedback(
  feedbackId: string,
  input: UpdateRecognitionFeedbackInput,
) {
  return requestProductApi<{ feedbackId: string }>(
    `/recognition-feedback/${encodeURIComponent(feedbackId)}`,
    {
      method: "PATCH",
      data: input as unknown as Record<string, unknown>,
      fallbackMessage: "纠错反馈暂时无法同步",
      timeout: 8_000,
    },
  );
}
