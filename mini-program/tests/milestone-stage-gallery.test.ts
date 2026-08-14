import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("presented milestone illustration gallery", () => {
  it("keeps the frozen poster illustration intact while exposing a separate locked gallery", () => {
    const page = read("pages/milestone-poster/index.tsx");
    const poster = read("components/milestone-poster/index.tsx");
    const gallery = read("components/milestone-stage-gallery/index.tsx");

    expect(page).toContain("<MilestoneStageGallery");
    expect(page).toContain("frozenAsset={poster.illustrationAsset}");
    expect(poster).toContain("onViewIllustrations");
    expect(gallery).toContain("MILESTONE_ASSET_IDS");
    expect(gallery).toContain("本次解锁");
  });

  it("locks the page and uses the shared cached illustration renderer while the gallery is open", () => {
    const page = read("pages/milestone-poster/index.tsx");
    const gallery = read("components/milestone-stage-gallery/index.tsx");

    expect(page).toContain("scrollLocked={galleryOpen}");
    expect(gallery).toContain("<Modal");
    expect(gallery).toContain("lockScroll");
    expect(gallery).toContain("<MilestoneJourneyIllustration");
    expect(gallery).toContain("onTouchStart");
    expect(gallery).toContain("onTouchEnd");
  });

  it("uses image-edge navigation without exposing the internal series counter", () => {
    const gallery = read("components/milestone-stage-gallery/index.tsx");
    const styles = readFileSync(resolve(process.cwd(), "src/styles/page.scss"), "utf8");

    expect(gallery).not.toContain("JOURNEY_STAGE_CONFIG");
    expect(gallery).not.toContain("milestone-stage-gallery__head");
    expect(gallery).toContain("milestone-stage-gallery__nav--prev");
    expect(gallery).toContain("milestone-stage-gallery__nav--next");
    expect(styles).toContain(".milestone-stage-gallery__nav {");
    expect(styles).toContain("top: 50%;");
  });

  it("places the gallery entry below the primary continue action", () => {
    const poster = read("components/milestone-poster/index.tsx");

    expect(poster.indexOf("milestone-poster__continue")).toBeLessThan(
      poster.indexOf("milestone-poster__gallery-link"),
    );
  });
});
