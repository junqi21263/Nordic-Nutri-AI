import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), "src", path), "utf8");

describe("My Journey Stitch restoration contract", () => {
  it("renders the approved content hierarchy and shared 2 by 2 stage card", () => {
    const page = read("pages/milestone-journey/index.tsx");
    expect(page).toContain("CURRENT JOURNEY");
    expect(page).toContain("Journey Collection");
    expect(page).toContain("<MilestoneStageCard");
    expect(page).toContain("<MilestoneStageSheet");
  });

  it("uses the existing resolver and the 390px editorial illustration scale", () => {
    const image = read("components/milestone-journey-illustration/index.tsx");
    const styles = read("styles/page.scss");
    const layout = read("styles/layout.scss");
    expect(image).toContain("resolveMilestoneIllustrationSource");
    expect(styles).toContain("padding: 48px 46px 96px;");
    expect(styles).toContain("aspect-ratio: 4 / 5;");
    expect(styles).toContain("flex: 0 0 40%;");
    expect(styles).toContain(".milestone-stage-card__image");
    expect(styles).toContain("height: 246px;");
    expect(styles).toContain("min-height: 224px;");
    expect(styles).toContain("column-gap: 32px;");
    expect(layout).toMatch(/\.page-layout--milestone-journey \.page-layout__content \{[\s\S]*?padding: 0;/);
    expect(layout).toMatch(/\.page-layout--milestone-journey \.content-stack \{[\s\S]*?gap: 0;/);
    expect(styles).toMatch(/\.milestone-journey-page__hero \{[\s\S]*?box-sizing: border-box;/);
    expect(styles).toMatch(/\.milestone-stage-card__body \{[\s\S]*?box-sizing: border-box;/);
  });

  it("keeps card clicks data-driven and never claims from Journey", () => {
    const page = read("pages/milestone-journey/index.tsx");
    expect(page).toContain('if (state === "presented" && event)');
    expect(page).toContain("setSelectedStage({ stage, state })");
    expect(page).not.toContain("claimPendingMilestone");
  });

  it("keeps semantic stage keys separate from the Chinese Journey display copy", () => {
    const stages = read("features/milestones/journey-stage.ts");
    const card = read("components/milestone-stage-card/index.tsx");
    const sheet = read("components/milestone-stage-sheet/index.tsx");
    expect(stages).toContain('theme: "START"');
    expect(stages).toContain('displayTitle: "起步"');
    expect(stages).toContain('displaySeries: "起步系列"');
    expect(stages).toContain('displayTitle: "生活方式"');
    expect(card).toContain("stage.displayTitle");
    expect(card).toContain("stage.displaySeries");
    expect(sheet).toContain("stage.displayTitle");
    expect(sheet).toContain("stage.displaySeries");
  });

  it("presents a fixed stage modal and previews series images in an in-app overlay", () => {
    const page = read("pages/milestone-journey/index.tsx");
    const styles = read("styles/page.scss");
    const sheet = read("components/milestone-stage-sheet/index.tsx");
    const bottomSheet = read("components/bottom-sheet/index.tsx");
    expect(styles).toContain(".modal.milestone-stage-sheet");
    expect(styles).toContain(".modal-backdrop--milestone-stage-sheet");
    expect(styles).toContain("overflow: hidden;");
    expect(styles).toContain("height: 164px;");
    expect(styles).toContain("height: 88px;");
    expect(sheet).toContain("<Modal");
    expect(sheet).toContain("lockScroll");
    expect(sheet).toContain("selectedIllustration");
    expect(sheet).toContain("milestone-stage-image-preview");
    expect(sheet).toContain("onBackdropClick={() => setSelectedIllustration(null)}");
    expect(sheet).toContain("open={open && Boolean(selectedIllustration)}");
    expect(bottomSheet).not.toContain("scrollable?: boolean");
    expect(styles).toContain(".modal-backdrop--milestone-stage-image-preview");
    expect(styles).toContain(".modal.milestone-stage-image-preview");
    expect(sheet).toContain("点击空白处关闭");
    expect(page).toContain("scrollLocked={Boolean(selectedStage)}");
  });
});
