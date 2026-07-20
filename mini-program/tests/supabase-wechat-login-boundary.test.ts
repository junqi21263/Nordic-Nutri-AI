import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authApi = readFileSync(resolve(import.meta.dirname, "../src/api/auth-api.ts"), "utf8");
const sessionManager = readFileSync(resolve(import.meta.dirname, "../src/auth/session-manager.ts"), "utf8");

describe("HTTPS WeChat login boundary", () => {
  it("bootstraps identity through wx.login and a HTTPS CloudBase function", () => {
    expect(authApi).toContain("Taro.login()");
    expect(authApi).toContain("requestWechatHttpsLogin");
    expect(authApi).not.toContain("callNordicApi");
    expect(authApi).not.toContain("requestCloudbaseLoginTicket");
    expect(authApi).not.toContain("signInWithCustomTicket");
    expect(authApi).not.toContain("getSupabaseClient");
  });

  it("keeps only a local business session and never calls RDB from the client", () => {
    expect(sessionManager).toContain("setNativeSession");
    expect(sessionManager).not.toContain("getCloudbaseDatabase()");
    expect(sessionManager).not.toContain("getCloudbaseAuth().getSession()");
    expect(sessionManager).not.toContain("getSupabaseClient");
  });
});
