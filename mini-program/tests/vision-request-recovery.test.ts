import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../src/auth/auth-store";

const transport = vi.fn();
const storage = new Map<string, unknown>();

vi.mock("../src/platform/product-transport", () => ({ productTransport: transport }));
vi.mock("../src/features/analytics/runtime", () => ({ pauseAnalytics: () => () => undefined, trackAnalytics: vi.fn() }));
vi.mock("../src/platform/food-media", () => ({ readWebImageBase64: vi.fn(), compressWebImage: vi.fn() }));
vi.mock("../src/utils/file-system-info", () => ({ getLocalFileInfo: async () => ({ size: 100_000 }) }));
vi.mock("../src/i18n", () => ({ getLocale: () => "zh-CN" }));
vi.mock("@tarojs/taro", () => ({
  default: {
    getImageInfo: async () => ({ width: 800, height: 600, type: "jpeg", orientation: "up" }),
    compressImage: async () => ({ tempFilePath: "/meal.jpg" }),
    getFileSystemManager: () => ({ readFile: ({ success }: { success: (value: { data: string }) => void }) => success({ data: "/9j/abcd" }) }),
    getStorageSync: (key: string) => storage.get(key),
    setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    removeStorageSync: (key: string) => storage.delete(key),
  },
}));

const analysisId = "11111111-1111-4111-8111-111111111111";
const result = { mealName: "早餐", mealType: "breakfast", confidence: 0.8, advice: "适量", items: [{ name: "鸡蛋", quantityG: 50, caloriesPer100g: 100, proteinPer100g: 10, carbsPer100g: 1, fatPer100g: 5 }] };

describe("ambiguous vision POST recovery", () => {
  beforeEach(() => {
    transport.mockReset();
    storage.clear();
    useAuthStore.getState().setSession({ user: { id: "user-1" }, accessToken: "access", refreshToken: "refresh" });
  });

  it("opens the result returned directly by the synchronous path", async () => {
    transport.mockResolvedValueOnce({ statusCode: 200, data: { analysisId, status: "completed", result } });
    const { analyzeProductImage } = await import("../src/api/vision-api");
    const meal = await analyzeProductImage("/meal.jpg");
    expect(meal.title).toBe("早餐");
    expect(transport.mock.calls.map(([call]) => call.method)).toEqual(["POST"]);
  });

  it("keeps a full recognition timeout after local image preparation", async () => {
    transport.mockResolvedValueOnce({ statusCode: 200, data: { analysisId, status: "completed", result } });
    const { analyzeProductImage } = await import("../src/api/vision-api");
    await analyzeProductImage("/meal.jpg", { deadlineAt: Date.now() + 1_000 });
    expect(transport.mock.calls[0][0].timeout).toBe(35_000);
  });

  it("uses an already completed result after the POST response is lost", async () => {
    transport.mockRejectedValueOnce(new Error("request timeout"));
    transport.mockResolvedValueOnce({ statusCode: 200, data: { analysisId, status: "completed", result } });
    const { analyzeProductImage } = await import("../src/api/vision-api");
    const meal = await analyzeProductImage("/meal.jpg");
    expect(meal.title).toBe("早餐");
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls.map(([call]) => call.method)).toEqual(["POST", "GET"]);
    expect(transport.mock.calls[1][0].url).toMatch(/\/vision-analysis\/request\//);
  });

  it("continues the existing background task without uploading again", async () => {
    transport.mockRejectedValueOnce(new Error("request timeout"));
    transport.mockResolvedValueOnce({ statusCode: 200, data: { analysisId, status: "processing", deadlineAt: new Date(Date.now() + 30_000).toISOString() } });
    transport.mockResolvedValueOnce({ statusCode: 200, data: { analysisId, status: "completed", result } });
    const { analyzeProductImage } = await import("../src/api/vision-api");
    const meal = await analyzeProductImage("/meal.jpg");
    expect(meal.title).toBe("早餐");
    expect(transport.mock.calls.map(([call]) => call.method)).toEqual(["POST", "GET", "GET"]);
  });

  it("keeps the original timeout when no matching server task exists", async () => {
    transport.mockRejectedValueOnce(new Error("request timeout"));
    transport.mockResolvedValueOnce({ statusCode: 404, data: { code: "NOT_FOUND" } });
    const { analyzeProductImage } = await import("../src/api/vision-api");
    await expect(analyzeProductImage("/meal.jpg")).rejects.toMatchObject({ name: "VISION_TIMEOUT" });
    expect(transport.mock.calls.map(([call]) => call.method)).toEqual(["POST", "GET"]);
  });
});
