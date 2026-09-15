import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Android H5 build command", () => {
  it("sets the Android platform before packaging Capacitor assets", () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, "../package.json"), "utf8"));
    expect(pkg.scripts["build:android"]).toBe(
      "NODE_ENV=development TARO_APP_ENV=development TARO_APP_PLATFORM=android taro build --type h5 --no-check",
    );
  });
});
