import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("HTTPS retry login boundary", () => {
  it("routes the login action through wx.login and the HTTPS login boundary", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/api/auth-api.ts"), "utf8");
    expect(source).toContain("Taro.login()");
    expect(source).toContain("requestWechatHttpsLogin");
    expect(source).not.toContain("callNordicApi");
    expect(source).not.toContain("requestCloudbaseLoginTicket");
    expect(source).not.toContain("signInWithCustomTicket");
    expect(source).not.toContain("getSupabaseClient");
  });
});
