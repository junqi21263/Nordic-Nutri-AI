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
import { getLocalFileInfo } from "../utils/file-system-info";
import { productApiEndpoint } from "./product-api-config";
import {
  isVisionTerminalStatus,
  nextVisionPollDelay,
  normalizeVisionStatus,
  type VisionAsyncResponse,
} from "../features/scanner/vision-async-client";
const maxImageBytes = MAX_UPLOAD_HARD_BYTES;
const CLIENT_TOTAL_BUDGET_MS = 15_000;
const VISION_PENDING_ANALYSIS_KEY = "nordic-nutri:vision-pending-analysis:v1";
/** Network upload target — keep base64 payload small enough for mobile + cloud timeout. */
const targetUploadBytes = MAX_UPLOAD_IMAGE_BYTES;
type VisionSource = "camera" | "album";

interface VisionImageMetadata {
  width: number | null;
  height: number | null;
  orientation: string | null;
  contentType: string | null;
}

interface VisionImageDiagnostics {
  source: VisionSource | null;
  originalContentType: string | null;
  finalContentType: string | null;
  originalBytes: number | null;
  finalBytes: number | null;
  originalWidth: number | null;
  originalHeight: number | null;
  finalWidth: number | null;
  finalHeight: number | null;
  orientation: string | null;
  imagePrepareDurationMs: number;
  imageReadDurationMs: number;
}

interface PreparedVisionImage {
  path: string;
  originalSize: number;
  original: VisionImageMetadata;
  imagePrepareDurationMs: number;
}

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

type VisionStatusPayload = VisionAsyncResponse & { message?: string };

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

interface PendingVisionAnalysis {
  analysisId: string;
  deadlineAt: number | null;
  savedAt: number;
}

function savePendingAnalysis(analysisId: string, deadlineAt?: number | null) {
  const value: PendingVisionAnalysis = {
    analysisId,
    deadlineAt: typeof deadlineAt === "number" && Number.isFinite(deadlineAt) ? deadlineAt : null,
    savedAt: Date.now(),
  };
  try {
    Taro.setStorageSync(VISION_PENDING_ANALYSIS_KEY, value);
  } catch {
    /* best effort */
  }
}

function clearPendingAnalysis(analysisId?: string) {
  try {
    const pending = readPendingVisionAnalysis();
    if (!analysisId || pending?.analysisId === analysisId) {
      Taro.removeStorageSync(VISION_PENDING_ANALYSIS_KEY);
    }
  } catch {
    /* best effort */
  }
}

export function readPendingVisionAnalysisId(): string | null {
  const pending = readPendingVisionAnalysis();
  return pending?.analysisId ?? null;
}

function readPendingVisionAnalysis(): PendingVisionAnalysis | null {
  try {
    const value = Taro.getStorageSync(VISION_PENDING_ANALYSIS_KEY);
    // Keep compatibility with the v1 string written by older builds.
    if (typeof value === "string" && value) {
      return { analysisId: value, deadlineAt: null, savedAt: 0 };
    }
    if (!value || typeof value !== "object") return null;
    const analysisId = (value as { analysisId?: unknown }).analysisId;
    if (typeof analysisId !== "string" || !analysisId) return null;
    const deadlineAt = (value as { deadlineAt?: unknown }).deadlineAt;
    const savedAt = (value as { savedAt?: unknown }).savedAt;
    return {
      analysisId,
      deadlineAt: typeof deadlineAt === "number" && Number.isFinite(deadlineAt) ? deadlineAt : null,
      savedAt: typeof savedAt === "number" && Number.isFinite(savedAt) ? savedAt : 0,
    };
  } catch {
    return null;
  }
}

export async function getVisionAnalysisStatus(analysisId: string): Promise<VisionStatusPayload> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error("登录状态已失效，请重新登录");
  const response = await Taro.request<unknown>({
    url: `${productApiEndpoint}/vision-analysis/${analysisId}`,
    method: "GET",
    header: { authorization: `Bearer ${token}` },
    timeout: 10_000,
  });
  if (response.statusCode !== 200) {
    const data = response.data as { code?: unknown; message?: unknown };
    const error = new Error(
      typeof data.message === "string" ? data.message : "识别状态暂时无法获取",
    );
    error.name = typeof data.code === "string" ? data.code : "VISION_STATUS_FAILED";
    throw error;
  }
  return normalizeVisionStatus(response.data);
}

function statusResultToMeal(status: VisionStatusPayload): ScannerMealFixture {
  if (status.status !== "completed" || !status.result) throw new Error("VISION_RESULT_INVALID");
  return mapVisionResult({
    ...(status.result as ProductVisionResult),
    analysisId: status.analysisId,
  });
}

export async function resumeVisionAnalysis(
  options: { deadlineAt?: number; onStatus?: (status: VisionStatusPayload) => void } = {},
) {
  const pending = readPendingVisionAnalysis();
  const analysisId = pending?.analysisId ?? null;
  if (!analysisId) return null;
  const deadlineAt = options.deadlineAt ?? pending?.deadlineAt ?? Date.now() + 30_000;
  let attempt = 0;
  let firstRead = true;
  while (firstRead || Date.now() < deadlineAt) {
    firstRead = false;
    const status = await getVisionAnalysisStatus(analysisId);
    options.onStatus?.(status);
    if (isVisionTerminalStatus(status.status)) {
      clearPendingAnalysis(analysisId);
      if (status.status === "completed") return statusResultToMeal(status);
      const error = new Error(status.message || status.errorCode || "图片识别失败，请重试");
      error.name = status.errorCode || `VISION_${status.status.toUpperCase()}`;
      throw error;
    }
    if (Date.now() >= deadlineAt) break;
    await new Promise((resolve) => setTimeout(resolve, nextVisionPollDelay(attempt)));
    attempt += 1;
  }
  const error = new Error("识别任务仍在处理中，请稍后返回查看");
  error.name = "VISION_ASYNC_PROCESSING";
  throw error;
}

function detectImageContentType(imageBase64: string, filePath?: string): string {
  // Magic-byte detection for mainstream formats (Android + Apple)
  if (imageBase64.startsWith("/9j/")) return "image/jpeg";
  if (imageBase64.startsWith("iVBOR")) return "image/png";
  if (imageBase64.startsWith("UklGR")) return "image/webp";
  if (imageBase64.startsWith("Qk")) return "image/bmp";
  // HEIC/HEIF (Apple default since iOS 11) — ftyp box at byte 4
  if (
    imageBase64.startsWith("AAAA") &&
    /AAAA[A-Za-z0-9+/]{0,4}GZ0eXB/i.test(imageBase64.slice(0, 24))
  )
    return "image/heic";
  // Fallback: infer from file extension
  if (filePath) {
    const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
    const extMap: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      bmp: "image/bmp",
      heic: "image/heic",
      heif: "image/heic",
    };
    if (extMap[ext]) return extMap[ext];
  }
  // Default to JPEG (WeChat usually converts HEIC to JPEG automatically)
  return "image/jpeg";
}

function contentTypeFromPath(filePath: string): string | null {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const extMap: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    bmp: "image/bmp",
    heic: "image/heic",
    heif: "image/heic",
  };
  return extMap[ext] ?? null;
}

function contentTypeFromImageType(type: unknown, filePath: string): string | null {
  if (typeof type !== "string" || !type.trim()) return contentTypeFromPath(filePath);
  const normalized = type.trim().toLowerCase();
  if (normalized.startsWith("image/")) return normalized;
  return contentTypeFromPath(`image.${normalized}`) ?? contentTypeFromPath(filePath);
}

async function imageMetadataOf(filePath: string): Promise<VisionImageMetadata> {
  try {
    const info = await Taro.getImageInfo({ src: filePath });
    return {
      width: Number.isFinite(info.width) ? info.width : null,
      height: Number.isFinite(info.height) ? info.height : null,
      orientation: typeof info.orientation === "string" ? info.orientation : null,
      contentType: contentTypeFromImageType(info.type, filePath),
    };
  } catch {
    return {
      width: null,
      height: null,
      orientation: null,
      contentType: contentTypeFromPath(filePath),
    };
  }
}

function createVisionError(message: string, cause: unknown, name?: string) {
  const error = new Error(message) as Error & { cause?: unknown };
  error.cause = cause;
  if (name) error.name = name;
  return error;
}

function remainingClientMs(deadlineAt: number) {
  return Math.max(0, deadlineAt - Date.now());
}

function throwIfClientDeadlineExceeded(deadlineAt: number) {
  if (remainingClientMs(deadlineAt) <= 0) {
    throw createVisionError(
      "识别时间有点久，请重新试一次",
      { code: "VISION_TIMEOUT" },
      "VISION_TIMEOUT",
    );
  }
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
    return (await getLocalFileInfo(filePath)).size ?? 0;
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

async function prepareImagePath(
  sourcePath: string,
  deadlineAt: number,
  onTiming?: (event: { stage: string; ms: number }) => void,
): Promise<PreparedVisionImage> {
  const startedAt = Date.now();
  let path = sourcePath;
  const originalSize = await fileSizeOf(sourcePath);
  const original = await imageMetadataOf(sourcePath);
  try {
    throwIfClientDeadlineExceeded(deadlineAt);
    // Keep the browser-side payload below WeChat image-security's 900KB fallback
    // limit. Quality-only often stalls on phone JPEGs, so shrink the long edge too.
    const firstQuality =
      originalSize > 8 * 1024 * 1024 ? 48 : originalSize > 3 * 1024 * 1024 ? 58 : 68;
    const passes: Array<{ quality: number; width: number }> = [
      { quality: firstQuality, width: 1280 },
      { quality: 54, width: 960 },
      { quality: 46, width: 750 },
      { quality: 36, width: 640 },
    ];
    for (const pass of passes) {
      throwIfClientDeadlineExceeded(deadlineAt);
      path = await compressOnce(path, pass.quality, pass.width);
      if ((await fileSizeOf(path)) <= targetUploadBytes) break;
    }
  } catch {
    if (remainingClientMs(deadlineAt) <= 0) throwIfClientDeadlineExceeded(deadlineAt);
    onTiming?.({ stage: "image_prepare", ms: Date.now() - startedAt });
    return {
      path: sourcePath,
      originalSize,
      original,
      imagePrepareDurationMs: Date.now() - startedAt,
    };
  }
  const imagePrepareDurationMs = Date.now() - startedAt;
  onTiming?.({ stage: "image_prepare", ms: imagePrepareDurationMs });
  return { path, originalSize, original, imagePrepareDurationMs };
}

export async function analyzeProductImage(
  sourcePath: string,
  options: {
    source?: VisionSource;
    recognitionStartedAt?: number;
    deadlineAt?: number;
    onTiming?: (event: { stage: string; ms: number }) => void;
  } = {},
): Promise<ScannerMealFixture> {
  const recognitionStartedAt = options.recognitionStartedAt ?? Date.now();
  const deadlineAt = options.deadlineAt ?? recognitionStartedAt + CLIENT_TOTAL_BUDGET_MS;
  const onTiming = options.onTiming;
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) {
    console.error("[vision] No auth token in session:", useAuthStore.getState().session);
    throw new Error("登录状态已失效，请重新登录");
  }
  const prepared = await prepareImagePath(sourcePath, deadlineAt, onTiming);
  const filePath = prepared.path;
  throwIfClientDeadlineExceeded(deadlineAt);
  let info;
  try {
    info = await getLocalFileInfo(filePath);
  } catch (err) {
    console.error("[vision] getFileInfo failed:", err);
    throw createVisionError("无法读取图片文件，请重新选择", err);
  }
  if (typeof info.size !== "number" || info.size > maxImageBytes) {
    throw new Error(formatImageTooLargeMessage(MAX_UPLOAD_HARD_BYTES / (1024 * 1024)));
  }
  assertImageWithinUploadHardLimit(info.size);
  let imageBase64;
  const readStartedAt = Date.now();
  try {
    imageBase64 = await readBase64(filePath);
    onTiming?.({ stage: "image_read", ms: Date.now() - readStartedAt });
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
  const finalMetadata = await imageMetadataOf(filePath);
  const diagnostics: VisionImageDiagnostics = {
    source: options.source ?? null,
    originalContentType: prepared.original.contentType,
    finalContentType: contentType,
    originalBytes: prepared.originalSize > 0 ? prepared.originalSize : null,
    finalBytes: typeof info.size === "number" ? info.size : null,
    originalWidth: prepared.original.width,
    originalHeight: prepared.original.height,
    finalWidth: finalMetadata.width,
    finalHeight: finalMetadata.height,
    orientation: finalMetadata.orientation || prepared.original.orientation,
    imagePrepareDurationMs: prepared.imagePrepareDurationMs,
    imageReadDurationMs: Date.now() - readStartedAt,
  };
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
  throwIfClientDeadlineExceeded(deadlineAt);
  const requestStartedAt = Date.now();
  const requestTimeout = remainingClientMs(deadlineAt);
  const clientRequestId = createClientRequestId();
  let response;
  try {
    response = await Taro.request<unknown>({
      url: `${productApiEndpoint}/vision-analysis`,
      method: "POST",
      header: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      data: {
        clientRequestId,
        source: options.source,
        clientCapabilities: {
          supportsAsyncVision: true,
          clientVersion: "phase2-local",
        },
        diagnostics,
        contentType,
        imageBase64,
      },
      timeout: requestTimeout,
    });
    onTiming?.({ stage: "request", ms: Date.now() - requestStartedAt });
  } catch (err) {
    console.error("[vision] network request failed:", err);
    const detail = String(
      (err as { errMsg?: unknown })?.errMsg || (err as Error)?.message || "",
    ).toLowerCase();
    const isTimeout =
      detail.includes("timeout") || detail.includes("aborted") || detail.includes("超时");
    throw createVisionError(
      isTimeout ? "识别时间有点久，请重新试一次" : "网络似乎不太稳定，请检查后重试",
      err,
      isTimeout ? "VISION_TIMEOUT" : "VISION_NETWORK_ERROR",
    );
  }
  const parseStartedAt = Date.now();
  const data = response.data as ProductVisionResult &
    VisionStatusPayload & { code?: unknown; message?: unknown };
  if (response.statusCode === 202) {
    const processing = normalizeVisionStatus(data);
    const serverDeadlineAt = processing.deadlineAt
      ? new Date(processing.deadlineAt).getTime()
      : null;
    savePendingAnalysis(processing.analysisId, serverDeadlineAt);
    onTiming?.({ stage: "async_handoff", ms: Date.now() - requestStartedAt });
    const resumed = await resumeVisionAnalysis({
      deadlineAt: serverDeadlineAt ?? Date.now() + 30_000,
      onStatus: (status) =>
        onTiming?.({ stage: `async_${status.currentStage || status.status}`, ms: 0 }),
    });
    if (!resumed) throw new Error("VISION_RESULT_INVALID");
    return resumed;
  }
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
      VISION_TIMEOUT: "识别时间有点久，请重新试一次",
      VISION_UPLOAD_FAILED: "图片上传失败，请检查网络后重试",
      VISION_SECURITY_FAILED: "图片安全检查失败，请重新拍摄",
      VISION_SECURITY_CHECK_FAILED: "图片安全检查失败，请重新拍摄",
      VISION_NUTRITION_FAILED: "营养信息处理失败，请重试",
      VISION_PERSISTENCE_FAILED: "识别结果保存失败，请重试",
      VISION_MODEL_FAILED: "图片识别失败，请重新拍摄",
      VISION_RETRYABLE: "图片识别失败，请重新拍摄",
    };
    const error = new Error(
      messageByCode[errorCode] ||
        (timedOut
          ? "识别时间有点久，请重新试一次"
          : backendMessage ||
            (response.statusCode === 503 ? "图片识别服务暂不可用" : "图片识别失败，请重新拍摄")),
    );
    error.name = errorCode;
    console.error("[vision] request failed:", response.statusCode, data);
    throw error;
  }
  clearPendingAnalysis(typeof data.analysisId === "string" ? data.analysisId : undefined);
  const meal = mapVisionResult(data);
  onTiming?.({ stage: "parse", ms: Date.now() - parseStartedAt });
  onTiming?.({ stage: "client_total", ms: Date.now() - recognitionStartedAt });
  return meal;
}
