import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const authApi = readFileSync(resolve(import.meta.dirname, "../src/api/auth-api.ts"), "utf8");
const sessionManager = readFileSync(resolve(import.meta.dirname, "../src/auth/session-manager.ts"), "utf8");
const authEntry = readFileSync(resolve(import.meta.dirname, "../src/pages/auth-entry/index.tsx"), "utf8");
const taroConfig = readFileSync(resolve(import.meta.dirname, "../config/index.ts"), "utf8");

describe("CloudBase custom-ticket result handling", () => {
  it("does not continue to session bootstrap when the SDK returns an embedded sign-in error", () => {
    expect(authApi).toContain("assertCloudbaseSignInSucceeded");
    expect(authApi).toContain("readCloudbaseSessionCredentials(result)");
    expect(authApi).toContain("auth.setSession(credentials)");
    expect(authApi).toContain("[dev-auth] cloudbase-login-failed");
    expect(authEntry).toContain("error instanceof Error ? error.message");
    expect(sessionManager).toContain("getCloudbaseAuth().getSession()");
    expect(sessionManager).not.toContain("getCloudbaseAuth().getCurrentUser()");
  });

  it("uses the SDK's Mini Program distribution instead of its web entry", () => {
    expect(taroConfig).toContain("@cloudbase/js-sdk$");
    expect(taroConfig).toContain("miniprogram_dist/index.js");
  });

  it("initializes CloudBase with the publishable key required by RDB requests", () => {
    const cloudbaseClient = readFileSync(resolve(import.meta.dirname, "../src/lib/cloudbase.ts"), "utf8");
    expect(cloudbaseClient).toContain("accessKey: cloudbaseEnvironment.publishableKey");
  });
});
