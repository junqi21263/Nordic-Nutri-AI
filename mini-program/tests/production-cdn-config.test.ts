import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(__dirname, "../..");

describe("production milestone CDN configuration", () => {
  it("keeps the public CDN root in a committed production env file", () => {
    const productionEnv = resolve(projectRoot, ".env.production");
    expect(existsSync(productionEnv)).toBe(true);
    expect(readFileSync(productionEnv, "utf8")).toContain(
      "TARO_APP_MILESTONE_ASSET_CDN=https://lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcloudbaseapp.com",
    );
  });

  it("does not load a developer local env file for production builds", () => {
    const config = readFileSync(resolve(projectRoot, "mini-program/config/index.ts"), "utf8");
    expect(config).toContain('requestedNodeEnv === "production"');
    expect(config).toContain('resolve(projectRoot, ".env.production")');
    expect(config).not.toContain('resolve(projectRoot, ".env.local"),\n  resolve(projectRoot, `.env.${requestedNodeEnv}`)');
  });

  it("permits the committed production env file through gitignore", () => {
    const gitignore = readFileSync(resolve(projectRoot, ".gitignore"), "utf8");
    expect(gitignore).toContain("!.env.production");
  });

  it("creates local milestone fallback paths only outside production", () => {
    const config = readFileSync(resolve(projectRoot, "mini-program/src/features/milestones/config.ts"), "utf8");
    expect(config).toContain("function getDevelopmentLocalMilestoneSource");
    expect(config).toContain('["", "assets", "images", "milestones", `${id}.jpg`].join("/")');
  });
});
