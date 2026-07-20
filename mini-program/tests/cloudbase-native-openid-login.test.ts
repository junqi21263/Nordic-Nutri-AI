import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("HTTPS WeChat login boundary", () => {
  it("exchanges wx.login code through the HTTPS login service and does not create a custom ticket", () => {
    const authApi = readFileSync(resolve(sourceRoot, "api/auth-api.ts"), "utf8");
    const app = readFileSync(resolve(sourceRoot, "app.tsx"), "utf8");
    expect(app).not.toContain("initializeNativeCloudbase");
    expect(authApi).toContain("Taro.login()");
    expect(authApi).toContain("requestWechatHttpsLogin");
    expect(authApi).not.toContain("callNordicApi");
    expect(authApi).not.toContain("signInWithCustomTicket");
    expect(authApi).not.toContain("requestCloudbaseLoginTicket");
  });
});
