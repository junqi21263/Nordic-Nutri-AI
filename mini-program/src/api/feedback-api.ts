import { createClientRequestId } from "../repositories/client-request-id";
import { requestProductApi } from "./product-api-client";

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
