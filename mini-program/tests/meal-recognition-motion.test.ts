import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getMealRecognitionMotionPhaseSchedule,
  getMealRecognitionMotionSchedule,
  mealRecognitionMotionConfig,
} from "../src/features/scanner/meal-recognition-motion";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), "utf8");

describe("meal recognition result reveal motion", () => {
  it("keeps the approved timing in one schedule", () => {
    expect(mealRecognitionMotionConfig.baseRevealAtMs).toBe(0);
    expect(mealRecognitionMotionConfig.nutritionRevealAtMs).toBe(250);
    expect(mealRecognitionMotionConfig.metricsCountAtMs).toBe(600);
    expect(mealRecognitionMotionConfig.contentRevealAtMs).toBe(1400);
    expect(mealRecognitionMotionConfig.bottomActionNativeRevealAtMs).toBe(860);
    expect(mealRecognitionMotionConfig.bottomActionShellDurationMs).toBe(390);
    expect(mealRecognitionMotionConfig.bottomActionShellPauseMs).toBe(120);
    expect(mealRecognitionMotionConfig.bottomActionDisclaimerDurationMs).toBe(300);
    expect(mealRecognitionMotionConfig.bottomActionAdjustStartMs).toBe(790);
    expect(mealRecognitionMotionConfig.bottomActionAdjustDurationMs).toBe(320);
    expect(mealRecognitionMotionConfig.bottomActionSaveStartMs).toBe(1010);
    expect(mealRecognitionMotionConfig.bottomActionSaveDurationMs).toBe(360);
    expect(mealRecognitionMotionConfig.completeAtMs).toBe(3820);
    expect(mealRecognitionMotionConfig.contentStaggerMs).toBe(80);
    expect(mealRecognitionMotionConfig.macroStaggerMs).toBe(60);
    expect(mealRecognitionMotionConfig.easing).toBe("cubic-bezier(.22, 1, .36, 1)");
  });

  it("derives stagger delays from the real food count", () => {
    const schedule = getMealRecognitionMotionSchedule(3);
    expect(schedule.ingredientDelaysMs).toEqual([0, 80, 160]);
    expect(schedule.macroDelaysMs).toEqual([0, 60, 120]);
  });

  it("keeps controller and counter animation lightweight and cancellable", () => {
    const controller = read("hooks/useMealRecognitionMotion.ts");
    const counter = read("hooks/useCountUp.ts");
    expect(controller).toContain("getMealRecognitionMotionPhaseSchedule");
    expect(getMealRecognitionMotionPhaseSchedule().map((entry) => entry.phase)).toEqual([
      "baseReveal",
      "nutritionReveal",
      "metricsCount",
      "contentReveal",
      "bottomActionReveal",
      "complete",
    ]);
    expect(controller).toContain("clearTimeout");
    expect(counter).toContain("requestAnimationFrame");
    expect(counter).toContain("cancelAnimationFrame");
  });

  it("wires motion only to the true scanner-to-result transition", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");
    expect(page).toContain("router.params.reveal");
    expect(page).toContain("shouldPlayMealRecognitionReveal");
    expect(page).toContain("useMealRecognitionMotion");
    expect(page).toContain("data-recognition-reveal");
    expect(page).toContain('data-recognition-reveal={isRecognitionMotion ? "true" : undefined}');
    expect(styles).toContain("data-recognition-reveal");
    expect(styles).toContain("analysis-result-page__summary-image");
    expect(styles).toContain("analysis-result-page__ai-status");
    expect(styles).toContain("analysis-result-page__actions");
    expect(styles).toContain('[data-reduced-motion="true"]');
  });

  it("keeps scan-result actions fixed without changing their existing handlers", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");
    const layout = read("styles/layout.scss");
    const bottomReveal = read("hooks/useBottomActionReveal.ts");

    expect(page).toContain('id="meal-bottom-action"');
    expect(page).toContain('className="analysis-result-page__bottom-bar"');
    expect(page).toContain('className="nutrition-disclaimer"');
    expect(page).toContain('className="analysis-result-page__actions"');
    expect(page).toContain('data-motion-layer="bottom"');
    expect(page).toContain("useBottomActionReveal");
    expect(page).toContain('animation={bottomAction.animation}');
    expect(page).toContain('animation={bottomAction.disclaimerAnimation}');
    expect(page).toContain('animation={bottomAction.adjustButtonAnimation}');
    expect(page).toContain('animation={bottomAction.saveButtonAnimation}');
    expect(page).toContain('data-bottom-revealed={bottomAction.phase === "complete" ? "true" : undefined}');
    expect(bottomReveal).toContain("Taro.createAnimation");
    expect(bottomReveal).toContain("createSelectorQuery");
    expect(bottomReveal).toContain("meal-bottom-action");
    expect(bottomReveal).toContain("boundingClientRect");
    expect(bottomReveal).toContain("Taro.nextTick");
    expect(bottomReveal).toContain("setTimeout");
    expect(bottomReveal).toContain("bottomActionNativeRevealAtMs");
    expect(bottomReveal).toContain("clearTimeout");
    expect(bottomReveal).toContain("[BottomReveal]");
    expect(bottomReveal).toContain('"initial hidden applied"');
    expect(bottomReveal).toContain('"initial paint complete"');
    expect(bottomReveal).toContain('"enter start"');
    expect(bottomReveal).toContain('"enter end"');
    expect(bottomReveal).toContain("playBottomActionSequence");
    expect(bottomReveal).toContain("bottomActionShellPauseMs");
    expect(bottomReveal).toContain("bottomActionAdjustStartMs");
    expect(bottomReveal).toContain("bottomActionSaveStartMs");
    expect(styles).toContain(".analysis-result-page__bottom-bar");
    expect(styles).toContain("position: fixed");
    expect(styles).toContain(".analysis-result-page__bottom-bar .analysis-result-page__actions");
    expect(styles).not.toContain("transform: translate3d(0, 140%, 0)");
    expect(layout).toContain("page-layout--analysis-result .page-layout__content");
    expect(layout).toContain("148px");
  });

  it("keeps replay development-only and free of recognition requests", () => {
    const page = read("pages/analysis-result/index.tsx");
    expect(page).toContain('process.env.NODE_ENV !== "production"');
    expect(page).toContain("setReplayKey");
    expect(page).not.toContain("analyzeProductImage");
  });

  it("confirms before leaving an unsaved analysis result", () => {
    const page = read("pages/analysis-result/index.tsx");

    expect(page).toContain("const [exitConfirmOpen, setExitConfirmOpen] = useState(false);");
    expect(page).toContain("onTopBarBack={() => setExitConfirmOpen(true)}");
    expect(page).toContain("<ConfirmDialog");
    expect(page).toContain('title="放弃本次分析？"');
    expect(page).toContain('description="返回后，本次未保存的分析结果将不再保留。"');
    expect(page).toContain('confirmLabel="放弃并返回"');
    expect(page).toContain('cancelLabel="继续分析"');
  });

  it("keeps the analysis exit dialog centered, fixed and single-line", () => {
    const page = read("pages/analysis-result/index.tsx");
    const layout = read("styles/layout.scss");
    const styles = read("styles/page.scss");

    expect(page).toContain("scrollLocked={exitConfirmOpen}");
    expect(styles).toContain(".page-layout--analysis-result .modal-backdrop");
    expect(styles).toContain("align-items: center;");
    expect(styles).toContain("touch-action: none;");
    expect(styles).toContain(".page-layout--analysis-result .confirm-dialog__actions .app-button");
    expect(styles).toMatch(/\.confirm-dialog__actions \.app-button\s*\{[^}]*margin:\s*0;/);
    expect(styles).toContain("box-sizing: border-box;");
    expect(styles).toContain("height: 80px;");
    expect(styles).toContain("min-height: 80px;");
    expect(styles).toContain("white-space: nowrap;");
    expect(layout).toContain("page-layout--scroll-locked .page-layout__scroll");
    expect(layout).toContain("overflow: hidden;");
  });

  it("keeps completed result layers visible and mounts its dialog outside the animated scroller", () => {
    const page = read("pages/analysis-result/index.tsx");

    expect(page).toContain('data-base-revealed={isBaseVisible ? "true" : undefined}');
    expect(page).toContain('data-nutrition-revealed={isNutritionVisible ? "true" : undefined}');
    expect(page).toContain('data-content-revealed={isContentVisible ? "true" : undefined}');
    expect(page).toContain("overlay={exitConfirmDialog}");
    expect(page).not.toContain('data-base-revealed={motion.isRevealing && isBaseVisible ? "true" : undefined}');
  });

  it("collapses only ingredient rows while keeping nutrition progress visible", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");

    expect(page).toContain("const [ingredientsExpanded, setIngredientsExpanded] = useState(false);");
    expect(page).toMatch(/ingredientsExpanded\s*\?\s*adjusted\.items\.map/);
    expect(page).toContain('ariaLabel={ingredientsExpanded ? "收起识别食材" : "展开识别食材"}');
    expect(page).toContain('ingredientsExpanded ? "收起" : "展开"');
    expect(page.indexOf("adjusted.items.map")).toBeLessThan(
      page.indexOf('className="analysis-result-page__macro-list"'),
    );
    expect(styles).toContain(".analysis-result-page__ingredients-heading");
    expect(styles).toContain(".analysis-result-page__ingredients-toggle");
  });

  it("keeps the NOVA insight mark legible on its light surface", () => {
    const styles = read("styles/components.scss");

    expect(styles).toContain(".ai-insight__orb");
    expect(styles).toContain("background: rgba($color-sage, 0.5);");
    expect(styles).toContain("color: $color-forest-green;");
  });

  it("uses a dedicated score ring tone separate from nutrition rings", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");

    expect(page).toContain('tone="score"');
    expect(styles).toContain(".analysis-result-page .circular-progress--score");
    expect(styles).toContain("#c9795d");
  });
});
