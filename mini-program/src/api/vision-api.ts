import Taro from "@tarojs/taro";
import { useAuthStore } from "../auth/auth-store";
import {
  formatImageTooLargeMessage,
  MAX_UPLOAD_IMAGE_BYTES,
  MAX_UPLOAD_HARD_BYTES,
  assertImageWithinUploadHardLimit,
} from "../features/media/image-upload-limits";
import { inferMealTypeFromTime } from "../features/meals/meal-type";
import type { ScannerMealFixture } from "../features/scanner/domain";
import { createClientRequestId } from "../repositories/client-request-id";
import { productApiEndpoint } from "./product-api-config";
const maxImageBytes = MAX_UPLOAD_HARD_BYTES;
/** Network upload target — keep base64 payload small enough for mobile + cloud timeout. */
const targetUploadBytes = MAX_UPLOAD_IMAGE_BYTES;

interface ProductVisionResult {
  analysisId: string;
  evaluation?: string;
  imageUrl?: string | null;
  imagePath?: string | null;
  nutritionSource?: string;
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
    nutritionSource?: string;
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

function detectImageContentType(imageBase64: string, filePath?: string): string {
  // Magic-byte detection for mainstream formats (Android + Apple)
  if (imageBase64.startsWith("/9j/")) return "image/jpeg";
  if (imageBase64.startsWith("iVBOR")) return "image/png";
  if (imageBase64.startsWith("UklGR")) return "image/webp";
  if (imageBase64.startsWith("Qk")) return "image/bmp";
  // HEIC/HEIF (Apple default since iOS 11) — ftyp box at byte 4
  if (imageBase64.startsWith("AAAA") && /AAAA[A-Za-z0-9+/]{0,4}GZ0eXB/i.test(imageBase64.slice(0, 24))) return "image/heic";
  // Fallback: infer from file extension
  if (filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const extMap: Record<string, string> = {
      jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
      bmp: "image/bmp", heic: "image/heic", heif: "image/heic",
    };
    if (extMap[ext]) return extMap[ext];
  }
  // Default to JPEG (WeChat usually converts HEIC to JPEG automatically)
  return "image/jpeg";
}

function createVisionError(message: string, cause: unknown) {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  return error;
}

function mapVisionResult(result: ProductVisionResult): ScannerMealFixture {
  return {
    id: result.analysisId,
    analysisId: result.analysisId,
    title: result.mealName,
    evaluation: result.evaluation,
    imageUrl: result.imageUrl ?? null,
    imagePath: result.imagePath ?? null,
    nutritionSource: result.nutritionSource ?? "ai_estimate",
    // Prefer local clock over vision-model guess; user can still change on the result page.
    mealType: inferMealTypeFromTime(),
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

async function fileSizeOf(filePath: string) {
  try {
    const info = await Taro.getFileInfo({ filePath });
    return "size" in info ? info.size : 0;
  } catch {
    return 0;
  }
}

async function compressOnce(
  src: string,
  quality: number,
  compressedWidth?: number,
): Promise<string> {
  try {
    const options = {
      src,
      quality,
      ...(typeof compressedWidth === "number" ? { compressedWidth } : {}),
    } as Parameters<typeof Taro.compressImage>[0];
    const result = await Taro.compressImage(options);
    return result.tempFilePath || src;
  } catch {
    if (typeof compressedWidth === "number") {
      try {
        const fallback = await Taro.compressImage({ src, quality });
        return fallback.tempFilePath || src;
      } catch {
        return src;
      }
    }
    return src;
  }
}

async function prepareImagePath(sourcePath: string) {
  let path = sourcePath;
  try {
    const originalSize = await fileSizeOf(sourcePath);
    // Keep the browser-side payload below WeChat image-security's 900KB fallback
    // limit. Quality-only often stalls on phone JPEGs, so shrink the long edge too.
    const firstQuality = originalSize > 8 * 1024 * 1024 ? 48 : originalSize > 3 * 1024 * 1024 ? 58 : 68;
    const passes: Array<{ quality: number; width: number }> = [
      { quality: firstQuality, width: 1280 },
      { quality: 54, width: 960 },
      { quality: 46, width: 750 },
      { quality: 36, width: 640 },
    ];
    for (const pass of passes) {
      path = await compressOnce(path, pass.quality, pass.width);
      if ((await fileSizeOf(path)) <= targetUploadBytes) break;
    }
  } catch {
    return sourcePath;
  }
  return path;
}

export async function analyzeProductImage(sourcePath: string): Promise<ScannerMealFixture> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) {
    console.error("[vision] No auth token in session:", useAuthStore.getState().session);
    throw new Error("登录状态已失效，请重新登录");
  }
  const filePath = await prepareImagePath(sourcePath);
  let info;
  try {
    info = await Taro.getFileInfo({ filePath });
  } catch (err) {
    console.error("[vision] getFileInfo failed:", err);
    throw createVisionError("无法读取图片文件，请重新选择", err);
  }
  if (!("size" in info) || info.size > maxImageBytes) {
    throw new Error(formatImageTooLargeMessage(MAX_UPLOAD_HARD_BYTES / (1024 * 1024)));
  }
  assertImageWithinUploadHardLimit("size" in info ? info.size : null);
  let imageBase64;
  try {
    imageBase64 = await readBase64(filePath);
  } catch (err) {
    console.error("[vision] readBase64 failed:", err);
    throw createVisionError("图片读取失败，请重新选择", err);
  }
  let contentType;
  try {
    contentType = detectImageContentType(imageBase64, filePath);
  } catch (err) {
    console.error("[vision] detectImageContentType failed:", err);
    throw err;
  }
  console.info(
    "[vision] Sending request to",
    `${productApiEndpoint}/vision-analysis`,
    "contentType:",
    contentType,
    "bytes:",
    info.size,
    "base64Length:",
    imageBase64.length,
  );
  let response;
  try {
    response = await Taro.request<unknown>({
      url: `${productApiEndpoint}/vision-analysis`,
      method: "POST",
      header: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: {
        clientRequestId: createClientRequestId(),
        contentType,
        imageBase64,
      },
      timeout: 55000,
    });
  } catch (err) {
    console.error("[vision] network request failed:", err);
    throw createVisionError("识别超时或网络不稳定，请压缩后重试或换一张更清晰的近景照片", err);
  }
  const data = response.data as ProductVisionResult & { code?: unknown; message?: unknown };
  if (response.statusCode !== 200) {
    const backendMessage = typeof data.message === "string" ? data.message : "";
    const errorCode = typeof data.code === "string" ? data.code : "VisionRequestError";
    const timedOut =
      response.statusCode === 443 ||
      response.statusCode === 504 ||
      response.statusCode === 408 ||
      /timeout|timed out|超时/i.test(backendMessage);
    const messageByCode: Record<string, string> = {
      VISION_CONTENT_BLOCKED: "图片未通过安全审核，请更换后重试",
      VISION_NON_FOOD: "上传的图片为非食物，请重新上传食物图片",
    };
    const error = new Error(
      timedOut
        ? "识别超时，请换一张更清晰、更近的餐盘照片后重试"
        : messageByCode[errorCode] ||
            backendMessage ||
            (response.statusCode === 503 ? "图片识别服务暂不可用" : "图片识别失败，请重新拍摄"),
    );
    error.name = errorCode;
    console.error("[vision] request failed:", response.statusCode, data);
    throw error;
  }
  return mapVisionResult(data);
}
