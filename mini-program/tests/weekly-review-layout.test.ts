import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getWeeklySharePreviewDimensions } from "../src/components/milestone-share-preview/layout";
import { formatWeeklyComparison } from "../src/pages/weekly-review/comparison-copy";

const readSource = (path: string) => readFileSync(resolve(import.meta.dirname, path), "utf8");

describe("weekly comparison copy", () => {
  it("describes fewer recorded days and meals without showing negative counts", () => {
    expect(formatWeeklyComparison({ recordedDays: -1, recordedMeals: -1 })).toBe(
      "较上周同期：记录天数少 1 天，餐数少 1 餐",
    );
  });

  it("describes increases and unchanged dimensions", () => {
    expect(formatWeeklyComparison({ recordedDays: 2, recordedMeals: 0 })).toBe(
      "较上周同期：记录天数多 2 天，餐数持平",
    );
  });

  it("describes decreases independently when comparison dimensions differ", () => {
    expect(formatWeeklyComparison({ recordedDays: 0, recordedMeals: -3 })).toBe(
      "较上周同期：记录天数持平，餐数少 3 餐",
    );
  });
});

describe("weekly review responsive layout", () => {
  it("wires the top-bar back button to return to the profile when history is unavailable", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");

    expect(page).toContain('import { navigateBackOrHome } from "../../utils/navigation";');
    expect(page).toContain('onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}');
  });

  it("uses the shared loading animation instead of oversized text while generating the share card", () => {
    const share = readSource("../src/pages/weekly-review/weekly-share.tsx");
    const styles = readSource("../src/pages/weekly-review/index.scss");

    expect(share).toContain('import { Loading } from "../../components/loading";');
    expect(share).toContain('<Loading label={t("share.generating")} />');
    expect(share).toContain('className="weekly-share__loading-modal"');
    expect(styles).toMatch(/weekly-share__loading-content \.loading__dot\s*\{[^}]*height:\s*24px/s);
    expect(styles).toMatch(/weekly-share__loading-content \.loading__dot\s*\{[^}]*width:\s*24px/s);
  });

  it("renders the weekly share preview as a page-level overlay outside the animated scroll area", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");

    expect(page).toMatch(/overlay=\{\s*sharing && review \? \([\s\S]*?<WeeklyShare/);
    expect(page).not.toMatch(/className="weekly-v2"[\s\S]*?<WeeklyShare/);
  });

  it("uses stable semantic wrappers instead of renderer-dependent child selectors", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");
    const styles = readSource("../src/pages/weekly-review/index.scss");

    [
      "weekly-v2__score",
      "weekly-v2__stats",
      "weekly-v2__copy",
      "weekly-v2__observation",
      "weekly-v2__goal",
    ].forEach((className) => expect(page).toContain(className));

    expect(styles).toContain(".weekly-v2__stats {");
    expect(styles).toContain(".weekly-v2__copy {");
    expect(styles).toContain(".weekly-v2__goal {");
    expect(styles).toContain("min-width: 0");
    expect(styles).not.toContain(".weekly-review__metrics Text:nth-child(2)");
  });

  it("keeps rhythm, next-goal, and share action typography locally sized", () => {
    const styles = readSource("../src/pages/weekly-review/index.scss");

    expect(styles).toMatch(/\.weekly-v2__heading\s*\{[^}]*font-size:\s*24px/s);
    expect(styles).toMatch(/\.weekly-v2__goal\s*\{[^}]*font-size:\s*20px/s);
    expect(styles).toMatch(/\.weekly-v2 \.weekly-v2__primary\s*\{[^}]*font-size:\s*24px/s);
  });

  it("uses the shared dialog typography for the selected-day summary", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");
    const styles = readSource("../src/pages/weekly-review/index.scss");

    expect(page).toContain('className="confirm-dialog__title"');
    expect(page).toContain('className="confirm-dialog__description"');
    expect(styles).toContain(".weekly-review-summary__actions {");
    expect(styles).toContain(".weekly-review-summary__actions .app-button {");
  });

  it("uses the shared modal surface and sizing without a custom summary shell", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");
    const styles = readSource("../src/pages/weekly-review/index.scss");
    const sharedStyles = readSource("../src/styles/components.scss");

    expect(page).toContain("<Modal");
    expect(page).not.toContain('className="weekly-v2__summary-modal"');
    expect(styles).not.toContain(".weekly-v2__summary-modal {");
    expect(sharedStyles).toMatch(/\.modal\s*\{[^}]*border-radius:\s*\$radius-24/s);
    expect(sharedStyles).toMatch(/\.modal\s*\{[^}]*max-height:\s*calc\(100dvh - 32px\)/s);
  });

  it("keeps the day-summary modal outside weekly button resets and uses shared buttons", () => {
    const page = readSource("../src/pages/weekly-review/index.tsx");
    const styles = readSource("../src/pages/weekly-review/index.scss");
    const modalStart = page.indexOf('<Modal\n        open={Boolean(selected)}');
    const modal = page.slice(modalStart, page.indexOf("</Modal>", modalStart));

    expect(page).toContain('import { AppButton } from "../../components/app-button";');
    expect(page.slice(0, modalStart).trimEnd()).toMatch(/<\/View>$/);
    expect(modal).toContain("weekly-review-summary__content");
    expect(modal).toContain('<AppButton size="medium"');
    expect(modal).toContain('variant="ghost"');
    expect(styles).toContain(".page-layout--weekly-v2 .weekly-review-summary__content");
    expect(styles).toContain("gap: $space-12;");
    expect(styles).toContain(".weekly-review-summary__actions .app-button {");
  });

  it("sizes the day-summary action to its label and improves the weekly CTA readability", () => {
    const styles = readSource("../src/pages/weekly-review/index.scss");

    expect(styles).toMatch(/\.weekly-review-summary__actions \.app-button\s*\{[^}]*width:\s*auto/s);
    expect(styles).toMatch(/\.weekly-v2 \.weekly-v2__primary\s*\{[^}]*font-size:\s*24px/s);
  });

  it("shrinks spacing on narrow phones and caps content width on larger screens", () => {
    const styles = readSource("../src/pages/weekly-review/index.scss");

    expect(styles).toContain("@media (max-width: 360px)");
    expect(styles).toContain("@media (min-width: 480px)");
    expect(styles).toMatch(/\.weekly-v2__day Text\s*\{[^}]*overflow-wrap:\s*anywhere/s);
  });

  it("fits the weekly share preview within both viewport dimensions", () => {
    const compact = getWeeklySharePreviewDimensions(320, 568, 0, 3 / 4);
    const short = getWeeklySharePreviewDimensions(390, 520, 48, 3 / 4);
    const wide = getWeeklySharePreviewDimensions(600, 900, 0, 3 / 4);

    expect(compact.width).toBeLessThanOrEqual(320 - 48);
    expect(short.height).toBeLessThanOrEqual(520 - 48 - 184);
    expect(wide.width).toBeLessThanOrEqual(360);
    expect(compact.width / compact.height).toBeCloseTo(3 / 4);
  });
});
