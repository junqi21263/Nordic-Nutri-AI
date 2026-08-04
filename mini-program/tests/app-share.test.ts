import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { APP_SHARE_PATH, APP_SHARE_TITLE, buildAppShareMessage } from "../src/features/share/app-share";

describe("app share card", () => {
  it("uses the approved share title and welcome entry path", () => {
    expect(APP_SHARE_TITLE).toBe("让每一餐都有价值");
    expect(APP_SHARE_PATH).toBe("/pages/welcome/index");
    const message = buildAppShareMessage();
    expect(message.title).toBe("让每一餐都有价值");
    expect(message.path).toBe("/pages/welcome/index");
    expect(message.imageUrl).toBe(
      "https://lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcloudbaseapp.com/brand/share-card.jpg",
    );
  });

  it("wires share into page entry points", () => {
    const home = readFileSync(resolve(import.meta.dirname, "../src/pages/home/index.tsx"), "utf8");
    const welcome = readFileSync(resolve(import.meta.dirname, "../src/pages/welcome/index.tsx"), "utf8");
    const topBar = readFileSync(resolve(import.meta.dirname, "../src/components/app-top-bar/index.tsx"), "utf8");
    const layout = readFileSync(resolve(import.meta.dirname, "../src/layouts/page-layout/index.tsx"), "utf8");
    expect(home).toContain("useAppShare");
    expect(welcome).toContain("useAppShare");
    expect(topBar).not.toContain("app-icon-ui");
    expect(topBar).toContain("Nordic Nutri AI");
    expect(layout).not.toContain("useAppShare");
  });
});
