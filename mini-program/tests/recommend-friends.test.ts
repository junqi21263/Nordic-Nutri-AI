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
    expect(appConfig).toContain("pages/recommend-friends/index");
    expect(appConfig).toContain("scope.writePhotosAlbum");
  });
});
