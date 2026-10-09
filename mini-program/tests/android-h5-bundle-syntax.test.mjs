import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, test } from "vitest";

const worktreeRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const androidBundle = resolve(worktreeRoot, "android/app/src/main/assets/public/js/app.js");
const h5Index = resolve(worktreeRoot, "mini-program/src/index.html");

describe("Android H5 bundle", () => {
  test("is valid JavaScript before it is packaged into the APK", () => {
    expect(existsSync(androidBundle)).toBe(true);
    expect(() => execFileSync(process.execPath, ["--check", androidBundle], { stdio: "pipe" })).not.toThrow();
  });

  test("does not depend on the browser-only React refresh runtime", () => {
    const bundle = execFileSync("sed", ["-n", "1,2p", androidBundle], { encoding: "utf8" });
    expect(bundle).not.toContain("$RefreshReg$");
  });

  test("locks Android WebView text sizing to the responsive layout", () => {
    const source = execFileSync("sed", ["-n", "1,120p", h5Index], { encoding: "utf8" });
    expect(source).toContain("-webkit-text-size-adjust: 100%");
    expect(source).toContain("text-size-adjust: 100%");
  });
});
