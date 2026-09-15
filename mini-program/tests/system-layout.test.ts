import { beforeEach, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  info: { statusBarHeight: NaN, windowWidth: 361, screenHeight: 738, safeArea: { bottom: 738 } },
  resize: undefined as undefined | (() => void),
  subscribe: undefined as undefined | ((notify: () => void) => () => void),
  snapshot: undefined as undefined | (() => any),
}));
vi.mock("@tarojs/taro", () => ({ default: {
  getWindowInfo: () => runtime.info,
  onWindowResize: (listener: () => void) => { runtime.resize = listener; },
  offWindowResize: () => { runtime.resize = undefined; },
} }));
vi.mock("react", () => ({ useSyncExternalStore: (subscribe: any, snapshot: any) => {
  runtime.subscribe = subscribe;
  runtime.snapshot = snapshot;
  return snapshot();
} }));

beforeEach(() => { vi.resetModules(); vi.stubEnv("TARO_ENV", "h5"); });

it.each([320, 361, 390, 430, 768])("reserves a finite H5 header at width %i", async (width) => {
  runtime.info.windowWidth = width;
  const { computeMetrics } = await import("../src/hooks/useSystemLayout");
  const layout = computeMetrics();
  expect(layout.statusBarHeight).toBe(0);
  expect(layout.totalHeaderHeight).toBe(44);
  expect(layout.screenWidth).toBe(width);
  expect(Object.values(layout).every(Number.isFinite)).toBe(true);
});

it("updates the shared snapshot on resize and removes the listener", async () => {
  const { useSystemLayout } = await import("../src/hooks/useSystemLayout");
  useSystemLayout();
  expect(runtime.subscribe).toBeTypeOf("function");
  const notify = vi.fn();
  const dispose = runtime.subscribe!(notify);
  runtime.info.windowWidth = 738;
  runtime.info.screenHeight = 361;
  runtime.info.safeArea.bottom = 361;
  runtime.resize!();
  expect(notify).toHaveBeenCalled();
  expect(runtime.snapshot!().screenWidth).toBe(738);
  expect(runtime.snapshot!().totalHeaderHeight).toBe(44);
  dispose();
  expect(runtime.resize).toBeUndefined();
});
