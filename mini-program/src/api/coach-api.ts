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

export interface ProductCoachReplyAction {
  label: string;
  detail: string;
}

export interface ProductCoachReply {
  priority: "protein" | "calories" | "carbs" | "fat" | "fiber" | "regularity" | "logging";
  headline: string;
  actions: ProductCoachReplyAction[];
  rationale: string;
  safety: "none" | "professional_consultation" | "urgent_care";
  source: "deepseek" | "rule_v2";
  model: string | null;
}

export interface ProductCoachBrief {
  date: string;
  priority: ProductCoachReply["priority"];
  remaining: Record<string, number>;
  completion: number;
  quickPrompts: string[];
}

export function getProductCoachMessages() {
  return requestProductApi<ProductCoachMessage[]>("/coach/messages", {
    method: "GET",
    fallbackMessage: "营养教练暂时无法回答，请稍后重试",
  });
}

export function getProductCoachBrief(date: string) {
  return requestProductApi<ProductCoachBrief>(`/coach/brief?date=${encodeURIComponent(date)}`, {
    method: "GET",
    fallbackMessage: "营养教练摘要暂时无法读取，请稍后重试",
  });
}

export function sendProductCoachMessage(prompt: string, date: string) {
  return requestProductApi<{
    conversationId: string;
    messages: ProductCoachMessage[];
    reply?: ProductCoachReply;
  }>("/coach-answer", {
    method: "POST",
    data: { clientRequestId: createClientRequestId(), prompt, date },
    fallbackMessage: "营养教练暂时无法回答，请稍后重试",
  });
}
