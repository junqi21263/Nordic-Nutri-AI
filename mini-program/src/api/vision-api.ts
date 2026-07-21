import Taro from "@tarojs/taro";
import { useAuthStore } from "../auth/auth-store";
import type { ScannerMealFixture } from "../features/scanner/domain";
import { createClientRequestId } from "../repositories/client-request-id";
import { productApiEndpoint } from "./product-api-config";
const maxImageBytes = 3 * 1024 * 1024;

interface ProductVisionResult {
  analysisId: string;
  mealName: string;
  mealType: ScannerMealFixture["mealType"];
  confidence: number;
  advice: string;
  items: Array<{
    name: string;
    quantityG: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
  }>;
}

function readBase64(filePath: string) {
  const fileSystem = Taro.getFileSystemManager();
  return new Promise<string>((resolve, reject) => {
    fileSystem.readFile({
      filePath,
      encoding: "base64",
      success: (result) =>
        typeof result.data === "string" ? resolve(result.data) : reject(new Error("图片读取失败")),
      fail: reject,
    });
  });
}

function detectImageContentType(imageBase64: string): "image/jpeg" | "image/webp" {
  if (imageBase64.startsWith("/9j/")) return "image/jpeg";
  if (imageBase64.startsWith("UklGR")) return "image/webp";
  throw new Error("图片格式不支持，请使用相机重新拍摄");
}

function mapVisionResult(result: ProductVisionResult): ScannerMealFixture {
  return {
    id: result.analysisId,
    analysisId: result.analysisId,
    title: result.mealName,
    mealType: result.mealType,
    imageKey: "bowl",
    confidence: Math.round(result.confidence * 100),
    insight: result.advice || "营养数值为图片估算，保存前请确认食材和份量。",
    items: result.items.map((item, index) => {
      const scale = item.quantityG / 100;
      return {
        id: `${result.analysisId}-${index}`,
        name: item.name,
        amount: `${Math.round(item.quantityG)}g`,
        calories: Math.round(item.caloriesPer100g * scale),
        protein: Math.round(item.proteinPer100g * scale),
        carbs: Math.round(item.carbsPer100g * scale),
        fat: Math.round(item.fatPer100g * scale),
      };
    }),
  };
}

export async function analyzeProductImage(sourcePath: string): Promise<ScannerMealFixture> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error("登录状态已失效，请重新登录");
  const compressed = await Taro.compressImage({ src: sourcePath, quality: 70 });
  const info = await Taro.getFileInfo({ filePath: compressed.tempFilePath });
  if (!("size" in info) || info.size > maxImageBytes) throw new Error("图片过大，请重新拍摄");
  const imageBase64 = await readBase64(compressed.tempFilePath);
  const contentType = detectImageContentType(imageBase64);
  const response = await Taro.request<unknown>({
    url: `${productApiEndpoint}/vision-analysis`,
    method: "POST",
    header: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    data: {
      clientRequestId: createClientRequestId(),
      contentType,
      imageBase64,
    },
    timeout: 30000,
  });
  const data = response.data as ProductVisionResult & { code?: unknown };
  if (response.statusCode !== 200) {
    const error = new Error(
      response.statusCode === 503 ? "图片识别服务暂不可用" : "图片识别失败，请重新拍摄",
    );
    error.name = typeof data.code === "string" ? data.code : "VisionRequestError";
    throw error;
  }
  return mapVisionResult(data);
}
