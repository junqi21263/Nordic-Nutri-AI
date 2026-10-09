import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sessionManager = readFileSync(
  resolve(import.meta.dirname, "../src/auth/session-manager.ts"),
  "utf8",
);

describe("Android push token session restore", () => {
  it("resyncs the pending push token after restoring a persisted Android session", () => {
    const restoreBlock = sessionManager.slice(
      sessionManager.indexOf("export async function restoreSession"),
      sessionManager.indexOf("export async function refreshSession"),
    );

    expect(restoreBlock).toContain('process.env.TARO_APP_PLATFORM === "android"');
    expect(restoreBlock).toContain("syncAndroidPushToken");
  });
});
