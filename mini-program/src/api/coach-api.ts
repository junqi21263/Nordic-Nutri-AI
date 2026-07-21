import { createClientRequestId } from "../repositories/client-request-id";
import { requestProductApi } from "./product-api-client";

export interface ProductCoachMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  provider: string | null;
  model: string | null;
  createdAt: string;
}

export function getProductCoachMessages() {
  return requestProductApi<ProductCoachMessage[]>("/coach/messages", {
    method: "GET",
    fallbackMessage: "营养教练暂时无法回答，请稍后重试",
  });
}

export function sendProductCoachMessage(prompt: string, date: string) {
  return requestProductApi<{ conversationId: string; messages: ProductCoachMessage[] }>(
    "/coach-answer",
    {
      method: "POST",
      data: { clientRequestId: createClientRequestId(), prompt, date },
      fallbackMessage: "营养教练暂时无法回答，请稍后重试",
    },
  );
}
