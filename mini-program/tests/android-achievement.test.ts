import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("Android achievement parity", () => {
  it("halves Android celebration speed without changing WeChat", () => {
    expect(source("components/achievement-confetti-canvas/index.tsx")).toContain('const animationSpeed = process.env.TARO_APP_PLATFORM === "android" ? 0.5 : 1');
    expect(source("styles/page.scss")).toContain("animation-duration: 1200ms;");
    expect(source("pages/android-auth/index.tsx")).toContain('className="auth-success-page"');
    expect(source("pages/android-auth/index.scss")).toContain(".auth-success-page .auth-hero__fade");
  });
  it("uses known canvas dimensions when H5 omits query size", () => {
    const canvas = source("components/achievement-confetti-canvas/index.tsx");
    expect(canvas).toContain("entry?.width || modalSize.width + horizontalSpread * 2");
    expect(canvas).toContain("entry?.height || modalSize.height + verticalSpread * 2");
    expect(canvas).toContain('process.env.TARO_APP_PLATFORM !== "android"');
  });
  it("scopes icon and typography fixes to Android achievements", () => {
    expect(source("components/achievement-unlock-modal/index.tsx")).toContain("achievement-unlock-overlay--android");
    const css = source("styles/page.scss");
    expect(css).toContain(".achievement-unlock-overlay--android {");
    expect(css).toContain(".achievement-unlock-overlay__title { font-size: 18PX;");
  });
});
