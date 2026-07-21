import Taro from "@tarojs/taro";
import { useAuthStore } from "../auth/auth-store";
import { productApiEndpoint } from "./product-api-config";

export type ProductApiMethod = "GET" | "POST" | "PATCH" | "DELETE";

interface ProductApiRequest {
  method: ProductApiMethod;
  data?: Record<string, unknown>;
  fallbackMessage: string;
}

export async function requestProductApi<T>(path: string, request: ProductApiRequest): Promise<T> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error("登录状态已失效，请重新登录");
  const response = await Taro.request<unknown>({
    url: `${productApiEndpoint}${path}`,
    method: request.method,
    header: {
      authorization: `Bearer ${token}`,
      ...(request.data ? { "content-type": "application/json" } : {}),
    },
    ...(request.data ? { data: request.data } : {}),
  });
  const data = response.data as T & { code?: unknown };
  if (response.statusCode !== 200) {
    const error = new Error(request.fallbackMessage);
    error.name = typeof data.code === "string" ? data.code : "ProductApiRequestError";
    throw error;
  }
  return data;
}
