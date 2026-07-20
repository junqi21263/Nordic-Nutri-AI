import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");

describe("app authentication wiring", () => {
  it("starts the auth-aware launch flow instead of navigating from local onboarding state directly", () => {
    const app = readFileSync(resolve(root, "app.tsx"), "utf8");
    const bootstrap = readFileSync(resolve(root, "auth/app-auth-bootstrap.ts"), "utf8");

    expect(app).toContain("startApplicationAuth");
    expect(app).not.toContain("isOnboardingCompleted");
    expect(bootstrap).toContain("createAuthBootstrap");
    expect(bootstrap).toContain("loginWithWechat");
    expect(bootstrap).not.toContain("getSupabaseClient");
    expect(bootstrap).toContain("authBootstrap.start({ allowSilentLogin: false })");
    expect(bootstrap).toContain('url: "/pages/auth-entry/index"');
  });
});
