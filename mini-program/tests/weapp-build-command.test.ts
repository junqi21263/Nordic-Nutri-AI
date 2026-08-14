import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WeApp build command", () => {
  it("selects the production env while skipping only Taro's native doctor preflight on macOS", () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
    expect(pkg.scripts["build:weapp"]).toBe(
      "NODE_ENV=production TARO_APP_ENV=production taro build --type weapp --no-check",
    );
  });
});
