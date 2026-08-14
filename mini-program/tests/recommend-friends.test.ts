import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECOMMEND_POSTER_IMAGE } from "../src/features/share/brand-cdn";

describe("recommend friends poster", () => {
  it("hosts the poster on the brand CDN", () => {
    expect(RECOMMEND_POSTER_IMAGE).toContain(
      "https://lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcloudbaseapp.com/brand/recommend-poster.jpg",
    );
  });

  it("wires profile entry above logout and uses WeChat share-image + album save", () => {
    const profile = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/index.tsx"), "utf8");
    const page = readFileSync(
      resolve(import.meta.dirname, "../src/pages/recommend-friends/index.tsx"),
      "utf8",
    );
    const helpers = readFileSync(
      resolve(import.meta.dirname, "../src/features/share/recommend-poster.ts"),
      "utf8",
    );
    const appConfig = readFileSync(resolve(import.meta.dirname, "../src/app.config.ts"), "utf8");

    expect(profile).toContain("推荐好友");
    expect(profile).toContain("/pages/recommend-friends/index");
    expect(profile.indexOf('openPage("/pages/recommend-friends/index")')).toBeLessThan(
      profile.indexOf("onClick={logout}"),
    );
    expect(page).toContain("shareRecommendPosterToWechat");
    expect(page).toContain("saveRecommendPosterToAlbum");
    expect(helpers).toContain("showShareImageMenu");
    expect(helpers).toContain("saveImageToPhotosAlbum");
    expect(helpers).toContain('scope: "scope.writePhotosAlbum"');
    expect(appConfig).toContain("pages/recommend-friends/index");
    expect(appConfig).not.toContain("scope.writePhotosAlbum");
  });

  it("keeps the poster share page fixed and lifts its poster and actions above the home indicator", () => {
    const config = readFileSync(
      resolve(import.meta.dirname, "../src/pages/recommend-friends/index.config.ts"),
      "utf8",
    );
    const page = readFileSync(resolve(import.meta.dirname, "../src/pages/recommend-friends/index.tsx"), "utf8");
    const styles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");

    expect(config).toContain("disableScroll: true");
    expect(styles).toContain(".page-layout--recommend-friends .page-layout__scroll");
    expect(styles).toContain("overflow: hidden");
    expect(styles).toContain("padding: 0 $space-20");
    expect(styles).toContain("justify-content: flex-start");
    expect(styles).toContain("align-self: center");
    expect(styles).toContain("margin: 0 auto");
    expect(page).toContain('mode="widthFix"');
    expect(styles).not.toContain("height: 100%;\n  max-height: 100%;\n  max-width: 620px;");
    expect(styles).toContain("padding: 0 0 calc(#{$space-8} + env(safe-area-inset-bottom))");
  });
});
