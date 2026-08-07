import { createClientRequestId } from "../repositories/client-request-id";
import { useAuthStore } from "../auth/auth-store";
import { productApiEndpoint } from "./product-api-config";
import { requestProductApi } from "./product-api-client";

const inflightRequests = new Map<string, Promise<unknown>>();

function coalesceRequest<T>(key: string, run: () => Promise<T>): Promise<T> {
  const existing = inflightRequests.get(key);
  if (existing) return existing as Promise<T>;
  const promise = run().finally(() => {
    if (inflightRequests.get(key) === promise) inflightRequests.delete(key);
  });
  inflightRequests.set(key, promise);
  return promise;
}

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
  source: "deepseek" | "hunyuan-exp" | "rule_v2";
  model: string | null;
}

export interface ProductCoachBrief {
  date: string;
  serverTime: string;
  priority: ProductCoachReply["priority"];
  remaining: Record<string, number>;
  completion: number;
  heroPrompt: string;
  quickPrompts: string[];
  dailyUsage: ProductCoachDailyUsage;
}

export interface ProductCoachDailyUsage {
  limit: number;
  used: number;
  remaining: number;
}

export interface ProductCoachDailyTip {
  type: "nutrition_tip" | "food_function" | "food_knowledge";
  headline: string;
  content: string;
  reason: string;
  food: { name: string; proteinG: number } | null;
  source: "deepseek" | "hunyuan-exp" | "rule_v2";
  model: string | null;
  cached?: boolean;
}

export interface ProductCoachDailyBrief {
  greeting: string;
  summary: string;
  suggestion: string;
  theme: "starter" | "protein_gap" | "energy_gap" | "meal_rhythm" | "dietary_balance" | "progress" | "consistency";
  source: "deepseek" | "hunyuan-exp" | "rule_v2";
  model: string | null;
  cached?: boolean;
}

export type ProductCoachStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "complete";
      conversationId: string;
      messages: ProductCoachMessage[];
      reply: ProductCoachReply;
      dailyUsage: ProductCoachDailyUsage;
    }
  | { type: "error"; code: string };

interface ChunkRequestTask {
  abort: () => void;
  onChunkReceived?: (callback: (result: { data: ArrayBuffer }) => void) => void;
}

interface WechatRequestRuntime {
  request: (options: {
    url: string;
    method: "POST";
    header: Record<string, string>;
    data: Record<string, string>;
    enableChunked: boolean;
    success: (result: { statusCode: number }) => void;
    fail: () => void;
  }) => ChunkRequestTask;
}

function isCoachStreamEvent(value: unknown): value is ProductCoachStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as {
    type?: unknown;
    text?: unknown;
    code?: unknown;
    conversationId?: unknown;
    messages?: unknown;
    reply?: unknown;
  };
  if (event.type === "delta") return typeof event.text === "string";
  if (event.type === "error") return typeof event.code === "string";
  return (
    event.type === "complete" &&
    typeof event.conversationId === "string" &&
    Array.isArray(event.messages) &&
    !!event.reply
  );
}

export function streamProductCoachMessage(
  prompt: string,
  date: string,
  onEvent: (event: ProductCoachStreamEvent) => void,
  clientRequestId = createClientRequestId(),
) {
  const token = useAuthStore.getState().session?.accessToken;
  const runtime = (globalThis as unknown as { wx?: WechatRequestRuntime }).wx;
  if (!token || !runtime?.request) return Promise.reject(new Error("流式能力暂不可用"));

  return new Promise<void>((resolve, reject) => {
    let buffered = "";
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };
    const task = runtime.request({
      url: productApiEndpoint + "/coach-answer/stream",
      method: "POST",
      header: { authorization: "Bearer " + token, "content-type": "application/json" },
      data: { clientRequestId, prompt, date },
      enableChunked: true,
      success: ({ statusCode }) => {
        if (statusCode === 200) finish(resolve);
        else finish(() => reject(new Error("营养教练暂时无法回答，请稍后重试")));
      },
      fail: () => finish(() => reject(new Error("营养教练暂时无法回答，请稍后重试"))),
    });
    if (typeof task.onChunkReceived !== "function") {
      task.abort();
      finish(() => reject(new Error("流式能力暂不可用")));
      return;
    }
    task.onChunkReceived(({ data }) => {
      buffered += new TextDecoder().decode(new Uint8Array(data));
      const lines = buffered.split("\n");
      buffered = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event: unknown = JSON.parse(line);
          if (!isCoachStreamEvent(event)) throw new Error("流式事件无效");
          if (event.type === "error") {
            finish(() => {
              const error = new Error("营养教练暂时无法回答，请稍后重试");
              error.name = event.code;
              reject(error);
            });
            return;
          }
          onEvent(event);
        } catch {
          finish(() => reject(new Error("营养教练暂时无法回答，请稍后重试")));
          return;
        }
      }
    });
  });
}

export function getProductCoachMessages() {
  return requestProductApi<ProductCoachMessage[]>("/coach/messages", {
    method: "GET",
    fallbackMessage: "营养教练暂时无法回答，请稍后重试",
  });
}

export function getProductCoachBrief(date: string) {
  return coalesceRequest(`coach-brief:${date}`, () =>
    requestProductApi<ProductCoachBrief>(`/coach/brief?date=${encodeURIComponent(date)}`, {
      method: "GET",
      fallbackMessage: "营养教练摘要暂时无法读取，请稍后重试",
    }),
  );
}

export function getProductCoachDailyTip(date: string, options?: { refresh?: boolean }) {
  const refresh = Boolean(options?.refresh);
  const params = new URLSearchParams({ date });
  if (refresh) params.set("refresh", "1");
  return coalesceRequest(`coach-daily-tip:${date}:${refresh ? "1" : "0"}`, () =>
    requestProductApi<ProductCoachDailyTip>(`/coach/daily-tip?${params.toString()}`, {
      method: "GET",
      fallbackMessage: "今日营养建议暂时无法读取，请稍后重试",
      timeout: 20_000,
    }),
  );
}

export function getProductCoachDailyBrief(date: string) {
  return coalesceRequest(`coach-daily-brief:${date}`, () =>
    requestProductApi<ProductCoachDailyBrief>(`/coach/daily-brief?date=${encodeURIComponent(date)}`, {
      method: "GET",
      fallbackMessage: "NOVA 今日提醒暂时无法读取，请稍后重试",
      timeout: 20_000,
    }),
  );
}

export function restartProductCoachConversation() {
  return requestProductApi<{ conversationId: string; messages: ProductCoachMessage[] }>("/coach/restart", {
    method: "POST",
    data: {},
    fallbackMessage: "重启对话失败，请稍后重试",
  });
}

export function sendProductCoachMessage(
  prompt: string,
  date: string,
  clientRequestId = createClientRequestId(),
) {
  return requestProductApi<{
    conversationId: string;
    messages: ProductCoachMessage[];
    reply?: ProductCoachReply;
    dailyUsage: ProductCoachDailyUsage;
  }>("/coach-answer", {
    method: "POST",
    data: { clientRequestId, prompt, date },
    fallbackMessage: "营养教练暂时无法回答，请稍后重试",
    timeout: 20_000,
  });
}
