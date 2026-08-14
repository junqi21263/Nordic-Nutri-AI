import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("milestone poster shared illustration loading", () => {
  it("resolves one local source before passing it to both page poster and Canvas", () => {
    const page = read("pages/milestone-poster/index.tsx");
    expect(page).toContain("resolveMilestoneIllustrationSource");
    expect(page).toContain("illustration={illustrationState.source ?? undefined}");
    expect(page).toContain("<MilestonePosterCanvas poster={resolvedPoster}");
  });

  it("keeps a fixed 4:3 hero placeholder with a retry action on asset errors", () => {
    const poster = read("components/milestone-poster/index.tsx");
    const styles = read("styles/page.scss");
    expect(poster).toContain("图片加载失败，点击重试");
    expect(poster).toContain("onIllustrationRetry");
    expect(styles).toContain(".milestone-poster__illustration--placeholder");
    expect(styles).toContain("aspect-ratio: 4 / 3;");
  });

  it("uses the already resolved local source in Canvas instead of starting another CDN resolve", () => {
    const canvas = read("components/milestone-poster-canvas/index.tsx");
    expect(canvas).toContain("poster.illustration ? {");
    expect(canvas).toContain("localSource: poster.illustration");
  });
});
