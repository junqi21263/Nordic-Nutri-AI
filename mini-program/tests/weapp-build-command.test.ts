import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("WeApp build command", () => {
  it("skips only Taro's native doctor preflight on macOS", () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
    expect(pkg.scripts["build:weapp"]).toBe("taro build --type weapp --no-check");
  });
});
