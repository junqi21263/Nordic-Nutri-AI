import { afterEach, expect, it, vi } from "vitest";
import { productTransport } from "../src/platform/product-transport";
import { chooseFoodImage } from "../src/platform/food-media";

const mocks = vi.hoisted(() => ({ native: vi.fn(), taro: vi.fn(), photo: vi.fn() }));
vi.mock("@tarojs/taro", () => ({ default: { request: mocks.taro } }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => true }, CapacitorHttp: { request: mocks.native } }));
vi.mock("@capacitor/camera", () => ({ Camera: { getPhoto: mocks.photo }, CameraResultType: { Uri: "uri" }, CameraSource: { Camera: "CAMERA", Photos: "PHOTOS", Prompt: "PROMPT" } }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks(); });

it("preserves native HTTP status, bearer and timeout without retrying errors", async () => {
  vi.stubEnv("TARO_APP_PLATFORM", "android");
  mocks.native.mockResolvedValue({ status: 429, data: { code: "LIMIT" } });
  expect(await productTransport({ url: "https://example.test/vision-analysis", method: "POST", header: { authorization: "Bearer test" }, data: { imageBase64: "abc" }, timeout: 35000 })).toEqual({ statusCode: 429, data: { code: "LIMIT" } });
  expect(mocks.native).toHaveBeenCalledWith(expect.objectContaining({ headers: { authorization: "Bearer test" }, readTimeout: 35000 }));
  expect(mocks.taro).not.toHaveBeenCalled();
});

it("records native product requests in VConsole without exposing authorization", async () => {
  vi.stubEnv("TARO_APP_PLATFORM", "android");
  const add = vi.fn().mockReturnValue({ id: "request-1" });
  const update = vi.fn();
  vi.stubGlobal("window", { __VCONSOLE_INSTANCE: { network: { add, update } } });
  mocks.native.mockResolvedValue({ status: 200, data: { ok: true, accessToken: "secret" } });

  await productTransport({
    url: "https://example.test/profile",
    method: "GET",
    header: { authorization: "Bearer secret", accept: "application/json" },
  });

  expect(add).toHaveBeenCalledWith(expect.objectContaining({
    url: "https://example.test/profile",
    method: "GET",
    status: "Pending",
    requestType: "custom",
  }));
  expect(update).toHaveBeenCalledWith("request-1", expect.objectContaining({
    status: 200,
    response: { ok: true, accessToken: "[redacted]" },
  }));
  expect(add.mock.calls[0][0].requestHeader).toEqual({ authorization: "[redacted]", accept: "application/json" });
});

it("retains Taro transport for Mini Program", async () => {
  vi.stubEnv("TARO_APP_PLATFORM", "weapp");
  mocks.taro.mockResolvedValue({ statusCode: 200, data: { ok: true } });
  expect(await productTransport({ url: "https://example.test" })).toEqual({ statusCode: 200, data: { ok: true } });
  expect(mocks.native).not.toHaveBeenCalled();
});

it("selects the requested native camera or album and returns a WebView-readable path", async () => {
  vi.stubEnv("TARO_APP_PLATFORM", "android");
  mocks.photo.mockResolvedValue({ webPath: "https://localhost/_capacitor_file_/photo.jpg" });
  expect(await chooseFoodImage("camera")).toContain("_capacitor_file_");
  expect(mocks.photo).toHaveBeenLastCalledWith(expect.objectContaining({ source: "CAMERA", correctOrientation: true, saveToGallery: false }));
  await chooseFoodImage("album");
  expect(mocks.photo).toHaveBeenLastCalledWith(expect.objectContaining({ source: "PHOTOS" }));
});
