import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const readProject = (path: string) => readFileSync(resolve(import.meta.dirname, "../", path), "utf8");

describe("plan regeneration layout isolation", () => {
  it("keeps the approved Preferences DOM and adds processing only as an overlay", () => {
    const page = read("pages/diet-preferences/index.tsx");

    expect(page).toContain("diet-preferences-page");
    expect(page).toContain("每日餐次");
    expect(page).toContain("重新生成计划");
    expect(page).toContain("<PlanTransitionOverlay");
    expect(page).not.toContain("plan-regeneration__preferences");
    expect(page).not.toContain("plan-regeneration__result");
    expect(page).not.toContain("<PlanReadyView");
  });

  it("restores the original Plan Ready content stack and action component", () => {
    const route = read("pages/nutrition-plan/index.tsx");
    expect(route).toContain("<BottomActionLayout");
    expect(route).not.toContain("<PlanTransitionOverlay");
    expect(route).not.toContain("nutrition-plan__fixed-actions");
    expect(route).not.toContain("plan-ready-view");
  });

  it("keeps the Plan Ready navigation and progress rail pinned while its content scrolls", () => {
    const route = read("pages/nutrition-plan/index.tsx");
    const styles = read("styles/page.scss");

    expect(route).toContain('className="nutrition-plan__sticky-header"');
    expect(styles).toMatch(
      /\.nutrition-plan-page \.nutrition-plan__sticky-header \{[^}]*pointer-events: none;[^}]*position: sticky;[^}]*top: 0;[^}]*z-index: 20;/,
    );
    expect(styles).toContain(
      ".nutrition-plan-page .nutrition-plan__sticky-header .onboarding-back {\n  pointer-events: auto;",
    );
  });

  it("uses staggered result reveals only for a regenerated Plan Ready entry", () => {
    const route = read("pages/nutrition-plan/index.tsx");
    const styles = read("styles/page.scss");

    expect(route).toContain("nutrition-plan__reveal-item--ready");
    expect(route).toContain("nutrition-plan__reveal-item--insight");
    expect(route).toContain("nutrition-plan__reveal-item--targets");
    expect(route).toContain("nutrition-plan__reveal-item--milestones");
    expect(route).toContain("nutrition-plan__reveal-item--actions");
    expect(styles).toContain("nutrition-plan-result-item-enter");
    expect(styles).toContain("animation-delay: 1000ms;");
    expect(styles).toContain("transform: translateY(36px) scale(0.98);");
  });

  it("reuses Stitch's slower staggered reveal and fixed actions for the first Plan Ready entry", () => {
    const route = read("pages/nutrition-plan/index.tsx");
    const styles = read("styles/page.scss");

    expect(route).toContain("initialPlanEntry");
    expect(route).toContain("initialRevealStarted");
    expect(route).toContain("setTimeout(() => setInitialRevealStarted(true), 80)");
    expect(route).toContain("shouldAnimatePlanReady");
    expect(styles).toContain("nutrition-plan-page--initial-entering");
    expect(styles).toContain("nutrition-plan-page--initial-pending .nutrition-plan__reveal-item");
    expect(styles).toContain("animation: nutrition-plan-result-item-enter 700ms cubic-bezier(.22, 1, .36, 1) both;");
    expect(styles).toContain("transform: translateY(36px) scale(0.98);");
    expect(styles).toContain("animation-delay: 1200ms;");
    expect(route).toContain("requestAnimationFrame(animate)");
    expect(route).toContain("easeOutQuart");
    expect(route).toContain("empty");
  });

  it("fixes the two regenerated Plan Ready actions to the safe-area bottom", () => {
    const styles = read("styles/page.scss");
    const layout = read("styles/layout.scss");

    expect(styles).toContain(".nutrition-plan-page--entering .bottom-action-layout.nutrition-plan__regenerated-actions {");
    expect(styles).toContain("position: fixed;");
    expect(styles).toContain("padding: $space-8 $stitch-page-gutter calc(4px + env(safe-area-inset-bottom));");
    expect(styles).toContain(".nutrition-plan-page .bottom-action-layout .app-button {\n  font-size: 28px;\n  min-height: 108px;");
    expect(layout).toContain(".page-layout--nutrition-plan.page-layout--nutrition-plan-animated .page-layout__content {\n  // Keep the last scrollable card reachable above the regenerated-plan CTA.\n  padding-bottom: calc($safe-area-bottom + 288px);");
  });

  it("keeps the transition implementation in its own fixed overlay component", () => {
    const overlay = read("components/plan-transition-overlay/index.tsx");
    expect(overlay).toContain('PlanTransitionOverlayPhase = "processing" | "completing"');
    expect(overlay).toContain('PlanTransitionOverlayVariant = "regenerate" | "initial"');
    expect(overlay).toContain("正在生成营养计划");
    expect(overlay).not.toContain("OPTIMIZING MACROS");
    expect(overlay).toContain("plan-transition-overlay__completion-mark");
    expect(overlay).toContain('name="check-inverse"');
    expect(overlay).not.toContain("正在重新计算营养目标");
    expect(overlay).not.toContain("根据新的饮食偏好调整每日计划");
    expect(overlay).not.toContain("计划已重新计算");
  });

  it("keeps processing legible without turning the button into a second spinner", () => {
    const preferences = read("pages/diet-preferences/index.tsx");
    const overlayStyles = read("components/plan-transition-overlay/index.scss");

    expect(preferences).toContain("showProcessingOverlay");
    expect(preferences).toContain("stitchInitialProcessingMotion.buttonPressMs");
    expect(preferences).toContain("正在生成计划");
    expect(preferences).toContain('name="refresh-cw"');
    expect(preferences).toContain('className="diet-preferences-page__action-source"');
    expect(preferences).not.toContain("loading={processing}");
    expect(preferences).toContain("disabled={processing}");
    expect(overlayStyles).toContain("background: rgba($stitch-page-bg, 0.5);");
  });

  it("does not repeat the goal-direction badge in the Plan Ready success card", () => {
    const route = read("pages/nutrition-plan/index.tsx");
    const successCard = route.slice(
      route.indexOf('className="nutrition-plan__plan-ready"'),
      route.indexOf('className="nutrition-plan__insight"'),
    );

    expect(successCard).not.toContain("nutrition-plan__goal-tag");
  });

  it("navigates directly after the micro completion without an old-page curtain", () => {
    const preferences = read("pages/diet-preferences/index.tsx");
    const result = read("pages/nutrition-plan/index.tsx");

    expect(preferences).toContain("await Taro.navigateTo({");
    expect(preferences).toContain('animationType: "none"');
    expect(preferences).toContain("animationDuration: 0");
    expect(result).toContain("disablePageEnterAnimation");
    expect(preferences).toContain('phase={overlayPhase}');
    expect(preferences).toContain('regenerationState === "navigating"');
    expect(preferences).not.toContain("coverRegeneration");
    expect(preferences).not.toContain("coverDurationMs");
    expect(result).not.toContain("<PlanTransitionOverlay");
    expect(readProject("src/app.config.ts")).toContain('backgroundColor: "#fbfaf7"');
  });

  it("runs the first plan generation through the processing overlay and enters Plan Ready once with its preview", () => {
    const preferences = read("pages/diet-preferences/index.tsx");
    const result = read("pages/nutrition-plan/index.tsx");

    expect(preferences).not.toContain('if (!fromSettings) {\n      void Taro.navigateTo({ url: "/pages/nutrition-plan/index" });');
    expect(preferences).toContain('variant={fromSettings ? "regenerate" : "initial"}');
    expect(preferences).toContain('"/pages/nutrition-plan/index?initial=1"');
    expect(result).toContain('const initialTransition = router.params.initial === "1";');
    expect(result).toContain('const planReadyTransition = regenerated || initialTransition;');
    expect(result).toContain('if (planReadyTransition && transitionPreview)');
  });

  it("keeps the transition preview local after the state machine finishes so Plan Ready does not load again", () => {
    const result = read("pages/nutrition-plan/index.tsx");

    expect(result).toContain("const [transitionPreview] = useState(() =>");
    expect(result).toContain("planReadyTransition ? regenerationPreview : null");
    expect(result).toContain("if (planReadyTransition && transitionPreview)");
    expect(result).not.toContain("planReadyTransition, regenerationPreview, revealRegeneration");
  });

  it("uses the Stitch first-generation ring loader instead of the regeneration bars", () => {
    const preferences = read("pages/diet-preferences/index.tsx");
    const overlay = read("components/plan-transition-overlay/index.tsx");
    const styles = read("components/plan-transition-overlay/index.scss");

    expect(preferences).toContain('diet-preferences-page--initial-processing');
    expect(overlay).toContain('plan-transition-overlay--initial');
    expect(overlay).toContain("StitchPlanProcessingCanvas");
    expect(styles).toContain(".plan-transition-overlay--initial");
    expect(preferences).toContain('className="diet-preferences-page__source"');
    expect(styles).toContain(".diet-preferences-page--initial-processing .diet-preferences-page__source");
    expect(styles).not.toContain(":not(");
    expect(styles).not.toContain("conic-gradient");
    expect(styles).toContain("filter: blur(4px);");
    expect(styles).toContain("background: #012d1d;");
    expect(styles).toContain("color: #ffffff;");
    expect(styles).not.toContain("@keyframes plan-transition-initial-ring");
    expect(overlay).toContain('name="check-inverse"');
    expect(styles).toContain("height: 96px;");
    expect(styles).toContain("width: 96px;");
  });

  it("does not present planned macro ratios as consumed progress before any food is recorded", () => {
    const circularProgress = read("components/circular-progress/index.tsx");
    const result = read("pages/nutrition-plan/index.tsx");

    expect(circularProgress).not.toContain("StitchMacroRingCanvas");
    expect(circularProgress).not.toContain("stitchDraw");
    expect(circularProgress).toContain("detail?: string;");
    expect(circularProgress).not.toContain('"—"');
    expect(result).toContain('detail={`${macro.value}g`}');
    expect(result).not.toContain('className="nutrition-plan__macro-value"');
  });

  it("draws the one processing ring as three adjoining segments rather than retracing the same circle", () => {
    const canvas = read("components/stitch-plan-processing-canvas/index.tsx");

    expect(canvas).toContain("const fatStartAngle");
    expect(canvas).toContain("const carbsStartAngle");
    expect(canvas).toContain("const proteinStartAngle");
    expect(canvas).toContain("let disposed = false;");
    expect(canvas).toContain("if (disposed) return;");
  });

  it("renders planned nutrients as three distinct colored rings", () => {
    const circularProgress = read("components/circular-progress/index.tsx");
    const plan = read("pages/nutrition-plan/index.tsx");
    const styles = read("styles/page.scss");

    expect(circularProgress).toContain('circular-progress--empty');
    expect(plan).toContain('tone: "amber"');
    expect(styles).toContain(".nutrition-plan-page .nutrition-plan__macro-ring");
    expect(styles).toContain(".nutrition-plan-page .nutrition-plan__macro-ring .circular-progress--compact::before");
    expect(styles).toContain(".circular-progress--amber");
    expect(styles).toContain("height: 124px;");
  });

  it("uses a save handoff so Home never promotes its background refresh to full-screen loading", () => {
    const plan = read("pages/nutrition-plan/index.tsx");
    const home = read("pages/home/index.tsx");

    expect(plan).toContain("usePlanSaveTransitionStore");
    expect(plan).toContain("setDailyTargets");
    expect(plan).toContain("<PlanSaveTransitionOverlay");
    expect(home).toContain("planSaveHandoffActive");
    expect(home).toContain("!planSaveHandoffActive");
    expect(home).toContain("<PlanSaveTransitionOverlay");
  });
});
