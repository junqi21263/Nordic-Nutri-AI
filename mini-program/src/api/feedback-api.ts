import { createClientRequestId } from "../repositories/client-request-id";
import { requestProductApi } from "./product-api-client";

export interface ProductFeedbackItem {
  id: string;
  category: "product" | "bug" | "feature" | "support" | "recognition";
  content: string;
  status: "new" | "reviewing" | "resolved" | "closed";
  adminReply: string | null;
  createdAt: string;
  repliedAt: string | null;
  replyReadAt: string | null;
}

export interface MyFeedbackResult {
  items: ProductFeedbackItem[];
  unreadReplyCount: number;
}

export async function submitProductFeedback(
  content: string,
  category: "product" | "bug" | "feature" | "support" = "product",
) {
  return requestProductApi<{ id: string; category: string; createdAt: string }>("/feedback", {
    method: "POST",
    data: {
      clientRequestId: createClientRequestId(),
      category,
      content,
      deviceContext: { platform: "wechat-mini-program" },
    },
    fallbackMessage: "反馈提交失败，请稍后重试",
  });
}

export const getMyFeedback = () => requestProductApi<MyFeedbackResult>("/feedback", {
  method: "GET",
  fallbackMessage: "反馈处理记录加载失败，请稍后重试",
});

export const markFeedbackRepliesRead = (feedbackIds: string[]) => requestProductApi<{ markedCount: number }>("/feedback/read", {
  method: "POST",
  data: { feedbackIds },
  fallbackMessage: "反馈已读状态更新失败，请稍后重试",
});
