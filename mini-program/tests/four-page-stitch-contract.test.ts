import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "..", "src");
const read = (relativePath: string) => readFileSync(resolve(sourceRoot, relativePath), "utf8");

describe("four-page Stitch visual contract", () => {
  it("uses scoped, icon-based onboarding selections", () => {
    const onboarding = read("pages/onboarding/index.tsx");
    const body = read("pages/body-profile/index.tsx");

    expect(onboarding).toContain('className="onboarding-page"');
    expect(body).toContain('className="body-profile-page"');
    expect(onboarding).toContain("NordicIcon");
    expect(body).toContain("NordicIcon");
    expect(onboarding).not.toContain('"✓"');
    expect(body).not.toContain('"✓"');
    expect(onboarding).toContain('name="check-inverse"');
    expect(body).toContain('name="check-inverse"');
  });

  it("keeps Body Profile in the step-two onboarding structure", () => {
    const source = read("pages/body-profile/index.tsx");

    expect(source).toContain("OnboardingHeader");
    expect(source).toContain("BottomActionLayout");
    expect(source).toContain("body-profile__foundation-card");
    expect(source).toContain("body-profile__foundation-heading");
    expect(source).toContain("body-profile__metrics--three-up");
    expect(source).toContain("body-profile__activity-list");
    expect(source).not.toContain("当前方向");
    expect(source).not.toContain("期待的变化");
    expect(source).not.toContain("targetWeightKg");
    expect(source).not.toContain("targetDate");
  });

  it("calibrates Body Profile typography and cards to the onboarding scale", () => {
    const styles = read("styles/page.scss");
    const start = styles.indexOf(".body-profile-page .body-profile__foundation-card");
    const bodyProfileStyles = styles.slice(start, start + 2_500);

    expect(start).toBeGreaterThan(-1);
    expect(bodyProfileStyles).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(bodyProfileStyles).toContain("border-radius: 20px;");
    expect(bodyProfileStyles).toContain("height: 36px;");
    expect(bodyProfileStyles).toContain("right: 8px;");
    expect(bodyProfileStyles).toContain("top: 12px;");
    expect(bodyProfileStyles).toContain("font-size: 22px;");
    expect(bodyProfileStyles).toContain("font-size: 48px;");
    expect(styles).toContain("min-height: 132px;");
    expect(styles).toContain(".body-profile-page .body-profile__heading .onboarding-heading__copy");
    expect(styles).toContain("font-size: 24px;");
    expect(styles).toContain("white-space: nowrap;");
    expect(styles).toContain(".onboarding-page .onboarding-heading__copy");
    expect(styles).toContain("border: 2px solid $stitch-brand-green;");
  });

  it("uses semantic Lucide SVGs for the Body Profile activity choices", () => {
    const expectedIcons = {
      "activity-low": "armchair",
      "activity-light": "footprints",
      "activity-moderate": "dumbbell",
      "activity-high": "bike",
    };

    for (const [asset, iconName] of Object.entries(expectedIcons)) {
      const svg = read(`assets/icons/${asset}.svg`);
      expect(svg).toContain(`data-lucide="${iconName}"`);
      expect(svg).toContain('stroke="#153F2B"');
      expect(svg).toContain('stroke-width="1.8"');
    }
  });

  it("uses dedicated semantic icons for Body Profile's foundation fields", () => {
    const source = read("pages/body-profile/index.tsx");
    const expectedIcons = {
      "calendar-days": "calendar-days",
      ruler: "ruler",
      weight: "weight",
      mars: "mars",
      venus: "venus",
    };

    for (const [asset, iconName] of Object.entries(expectedIcons)) {
      const svg = read(`assets/icons/${asset}.svg`);
      expect(svg).toContain(`data-lucide="${iconName}"`);
      expect(svg).toContain('stroke="#153F2B"');
      expect(svg).toContain('stroke-width="1.8"');
    }

    expect(source).toContain('name="calendar-days"');
    expect(source).toContain('name="ruler"');
    expect(source).toContain('name="weight"');
    expect(source).toContain('name={value === "male" ? "mars" : "venus"}');
  });

  it("keeps Nutrition Plan in the generated-plan hierarchy", () => {
    const source = read("pages/nutrition-plan/index.tsx");
    const styles = read("styles/page.scss");

    expect(source).toContain('className="nutrition-plan-page"');
    expect(source).toContain("OnboardingHeader");
    expect(source).toContain("nutrition-plan__plan-ready");
    expect(source).toContain("nutrition-plan__insight");
    expect(source).toContain("nutrition-plan__targets-card");
    expect(source).toContain("nutrition-plan__milestone-list");
    expect(source).toContain("你的计划已准备好");
    expect(source).not.toContain('tone="dark"');
    expect(source).not.toContain("计算依据");
    expect(source).not.toContain("每周训练");
    expect(styles).toContain("font-size: 44px;");
    expect(styles).toContain("font-size: 56px;");
    expect(styles).toContain("height: 140px;");
  });

  it("reserves enough scroll space for Nutrition Plan's stacked fixed actions", () => {
    const source = read("pages/nutrition-plan/index.tsx");
    const styles = read("styles/layout.scss");

    expect(source).toContain('className="page-layout--onboarding page-layout--nutrition-plan"');
    expect(styles).toContain(".page-layout--nutrition-plan .page-layout__content");
    expect(styles).toContain("($stitch-action-height * 2)");
  });

  it("uses Lucide assets for the plan's feedback and nutrition icons", () => {
    const expectedIcons = {
      celebration: "party-popper",
      flame: "flame",
      protein: "beef",
      carbs: "wheat",
      fat: "droplet",
      milestone: "badge-check",
      "check-inverse": "check",
    };

    for (const [asset, iconName] of Object.entries(expectedIcons)) {
      const svg = read(`assets/icons/${asset}.svg`);
      expect(svg).toContain(`data-lucide="${iconName}"`);
    }
  });

  it("adds dietary preferences as step three before the step-four plan preview", () => {
    const appConfig = read("app.config.ts");
    const bodyProfile = read("pages/body-profile/index.tsx");
    const preferences = read("pages/diet-preferences/index.tsx");
    const plan = read("pages/nutrition-plan/index.tsx");
    const preferenceConfig = read("features/onboarding/diet-preferences-config.ts");
    const styles = read("styles/page.scss");

    expect(appConfig).toContain('"pages/diet-preferences/index"');
    expect(bodyProfile).toContain('url: "/pages/diet-preferences/index"');
    expect(preferences).toContain('className="diet-preferences-page"');
    expect(preferences).toContain('step="第 3 步，共 4 步"');
    expect(preferences).toContain("饮食偏好与限制");
    expect(preferences).toContain("diet-preferences-config");
    expect(preferences).toContain('url: "/pages/nutrition-plan/index"');
    expect(preferenceConfig).toContain("dietaryPatternOptions");
    expect(preferenceConfig).toContain("foodAvoidanceOptions");
    expect(preferenceConfig).toContain("mealCountOptions");
    expect(preferenceConfig).toContain('value: "vegan"');
    expect(preferenceConfig).toContain('value: "gluten"');
    expect(preferenceConfig).toContain('value: "5"');
    expect(plan).toContain("OnboardingHeader");
    expect(plan).toContain('brand="Nordic Nutri AI"');
    expect(plan).toContain('step="第 4 步，共 4 步"');
    expect(plan).toContain("progress={1}");
    expect(styles).toContain(".diet-preferences-page");
    expect(styles).toContain(".nutrition-plan-page .app-navbar__step");
  });

  it("keeps Home Dashboard labels Chinese and uses the Stitch action hierarchy", () => {
    const source = read("pages/home/index.tsx");

    expect(source).toContain("早上好，{profile.profile.nickname}");
    expect(source).toContain("今日目标");
    expect(source).toContain("拍照识别");
    expect(source).toContain("记录饮食");
    expect(source).toContain("今日饮食");
    expect(source).not.toContain('eyebrow="Scan Meal"');
    expect(source).not.toContain(">Add Meal<");
    expect(source).not.toContain('name="ellipsis"');
  });

  it("uses the Stitch home dashboard hierarchy and local Lucide actions", () => {
    const source = read("pages/home/index.tsx");
    const styles = read("styles/page.scss");

    expect(source).toContain('className="home-page"');
    expect(source).toContain("page-layout--home");
    expect(source).toContain('name="scan-line"');
    expect(source).toContain('name="circle-plus"');
    expect(source).toContain('className="home-page__target"');
    expect(source).toContain('className="home-page__meal-list"');
    expect(styles).toContain(".home-page .daily-summary");
    expect(styles).toContain(".home-page .ai-insight");
    expect(styles).toContain(".daily-summary__dashboard-ring");
    expect(styles).toContain(".home-page__meal-list");
    expect(styles).toContain("min-height: 96px;");
    const layoutStyles = read("styles/layout.scss");
    expect(layoutStyles).toContain(".page-layout__content");
    const pageLayout = read("layouts/page-layout/index.tsx");
    expect(pageLayout).toContain("AppTopBar");
  });

  it("uses local Lucide icons instead of Unicode glyphs in the Home action and tab bars", () => {
    const home = read("pages/home/index.tsx");
    const tabBar = read("components/bottom-tab-bar/index.tsx");

    expect(home).toContain('name="scan-line"');
    expect(home).toContain('name="circle-plus"');
    expect(tabBar).toContain('icon: "home"');
    expect(tabBar).toContain('icon: "scan-line"');
    expect(tabBar).toContain('icon: "list-checks"');
    expect(tabBar).toContain('icon: "bot"');
    expect(tabBar).toContain('icon: "user-round"');
    expect(tabBar).not.toContain('icon: "⌂"');
    expect(tabBar).not.toContain('icon: "◉"');
  });

  it("uses native custom-tab routing instead of rebuilding the page stack on bottom-tab changes", () => {
    const appConfig = read("app.config.ts");
    const tabBar = read("components/bottom-tab-bar/index.tsx");
    const layout = read("layouts/page-layout/index.tsx");
    const customTabBar = read("custom-tab-bar/index.tsx");

    expect(appConfig).toContain("custom: true");
    expect(appConfig).toContain('pagePath: "pages/home/index"');
    expect(appConfig).toContain('pagePath: "pages/profile/index"');
    expect(tabBar).toContain("Taro.switchTab");
    expect(tabBar).toContain("Taro.navigateTo");
    expect(layout).toContain("useTabBarStore");
    expect(customTabBar).toContain("BottomTabBar");
  });

  it("switches Home meal actions to their tab pages instead of navigating into a tab stack", () => {
    const home = read("pages/home/index.tsx");

    expect(home).toContain('Taro.navigateTo({ url: "/pages/food-scanner/index" })');
    expect(home).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
  });

  it("avoids full-stack relaunches when returning from the main nutrition flows", () => {
    const home = read("pages/home/index.tsx");
    const plan = read("pages/nutrition-plan/index.tsx");
    const analysis = read("pages/analysis-result/index.tsx");
    const adjustment = read("pages/portion-adjustment/index.tsx");
    const detail = read("pages/meal-detail/index.tsx");

    for (const source of [plan, adjustment]) {
      expect(source).not.toContain("Taro.reLaunch");
    }
    expect(home).toContain("Taro.switchTab");
    expect(plan).toContain("Taro.switchTab");
    expect(detail).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
    expect(analysis).toContain("Taro.redirectTo");
    expect(adjustment).toContain("Taro.redirectTo");
  });

  it("organizes Meal Records around a calendar, daily digest, and meal timeline", () => {
    const source = read("pages/meal-records/index.tsx");
    const styles = read("styles/page.scss");

    expect(source).toContain('className="meal-records-page"');
    expect(source).toContain('className="meal-records-page__calendar"');
    expect(source).toContain('className="meal-records-page__summary"');
    expect(source).toContain('className="meal-records-page__timeline"');
    expect(source).toContain('className="meal-records-page__fab"');
    expect(source).toContain("store.setSelectedDate");
    expect(source).toContain('url: "/pages/food-scanner/index"');
    expect(styles).toContain(".meal-records-page__calendar");
    expect(styles).toContain(".meal-records-page__timeline");
    expect(styles).toContain(".meal-records-page__fab");
    expect(read("styles/layout.scss")).toContain(".page-layout__content");
    expect(read("layouts/page-layout/index.tsx")).toContain("AppTopBar");
  });

  it("renders the food scanner as a real visual-analysis camera flow with a visible scan transition", () => {
    const source = read("pages/food-scanner/index.tsx");
    const styles = read("styles/page.scss");

    expect(source).toContain('className="food-scanner-page"');
    expect(source).toContain("isScanning");
    expect(source).toContain("scanner-frame--scanning");
    expect(source).toContain('name="camera"');
    expect(source).toContain('name="images"');
    expect(source).not.toContain("scanner-frame__mode-strip");
    expect(source).not.toContain("原生相机");
    expect(source).not.toContain('"▦"');
    expect(source).not.toContain("food-scanner-page__header-action");
    expect(source).toContain('className="scanner-ai-status"');
    expect(source).toContain('name="sparkles"');
    expect(source).toContain("analyzeProductImage");
    expect(source).not.toContain("captureRandom");
    expect(styles).toContain(".scanner-frame__scan-line");
    expect(styles).toContain("@keyframes scanner-sweep");
    expect(styles).toContain("@keyframes scanner-glow");
    expect(styles).toContain("height: 660px;");
    expect(styles).toContain("margin: 0 auto;");
    expect(source).not.toContain('className="food-scanner-page__page-title"');
    expect(source).toContain("拍摄并 AI 分析");
    expect(source).not.toContain("拍摄并本地分析");
    expect(styles).toContain(".food-scanner-page__page-title");
    expect(source).toContain('className="scanner-primary-action"');
    expect(styles).toContain("font-size: $font-h1;");
    expect(styles).toContain("width: 84%;");
  });

  it("adds named headers to scanner and analysis, and exposes the nutrition coach chat", () => {
    const scanner = read("pages/food-scanner/index.tsx");
    const analysis = read("pages/analysis-result/index.tsx");
    const coach = read("pages/coach/index.tsx");
    const styles = read("styles/page.scss");
    const layout = read("styles/layout.scss");

    expect(scanner).not.toContain('className="food-scanner-page__page-title"');
    expect(analysis).not.toContain('className="analysis-result-page__page-title"');
    expect(analysis).not.toContain('className="analysis-result-page__back"');
    expect(coach).toContain('className="coach-chat"');
    expect(coach).not.toContain('className="coach-chat__page-title"');
    expect(coach).toContain("sendMessage");
    expect(coach).toContain("onInput");
    expect(styles).toContain(".coach-composer");
    expect(layout).toContain(".page-layout--coach-chat .page-layout__content");
  });

  it("uses the Meal Records title scale for analysis and secondary page headers", () => {
    const styles = read("styles/page.scss");

    expect(styles).toContain(".meal-records-page__header-title,\n.food-scanner-page__page-title,");
    expect(styles).toContain(".coach-chat__page-title");
  });

  it("renders analysis results as a lowered, scanner-aligned nutrition review", () => {
    const source = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");
    const layoutStyles = read("styles/layout.scss");

    expect(source).toContain('className="analysis-result-page"');
    expect(source).toContain('className="analysis-result-page__summary"');
    expect(source).toContain('className="analysis-result-page__actions"');
    expect(source).not.toContain('className="analysis-result-page__page-title"');
    expect(source).not.toContain('className="analysis-result-page__back"');
    expect(source).not.toContain('name="back"');
    expect(source).toContain('name="sparkles"');
    expect(source).toContain('className="analysis-result-page__summary-image"');
    expect(source).toContain("hideNavigation");
    expect(source).toContain('className="page-layout--analysis-result"');
    expect(styles).toContain(".analysis-result-page__summary-image");
    expect(styles).toContain(".analysis-result-page__actions");
    expect(styles).toContain("width: 100%;");
    expect(source).toContain('className="analysis-result-page__confidence"');
    expect(styles).toContain(".analysis-result-page__confidence .badge");
    expect(styles).toContain("margin-left: -$space-8;");
    expect(source).toContain('actionLabel="查看饮食记录"');
    expect(source).toContain('"/pages/meal-records/index"');
    expect(read("components/ai-insight-card/index.tsx")).toContain("onActionClick");
    expect(layoutStyles).toContain(".page-layout--analysis-result .page-layout__content");
  });

  it("uses centered named headers for portion adjustment and meal details", () => {
    const adjustment = read("pages/portion-adjustment/index.tsx");
    const detail = read("pages/meal-detail/index.tsx");
    const styles = read("styles/page.scss");
    const layoutStyles = read("styles/layout.scss");

    expect(adjustment).toContain('className="portion-adjustment-page__page-title"');
    expect(adjustment).toContain('className="page-layout--portion-adjustment"');
    expect(adjustment).toContain("hideNavigation");
    expect(adjustment).not.toContain('name="back"');
    expect(detail).not.toContain('className="meal-detail-page__page-title"');
    expect(detail).toContain('className="page-layout--meal-detail"');
    expect(detail).toContain("hideNavigation");
    expect(detail).toContain('className="meal-detail-page__hero"');
    expect(detail).toContain('className="meal-detail-page__composition"');
    expect(detail).toContain('className="meal-detail-page__ingredients"');
    expect(detail).toContain('className="meal-detail-page__ingredient-row"');
    expect(detail).toContain('className="meal-detail-page__actions"');
    expect(detail).toContain('name="protein"');
    expect(detail).toContain('name="carbs"');
    expect(detail).toContain('name="fat"');
    expect(styles).toContain(".portion-adjustment-page__page-title,");
    expect(styles).toContain(".meal-detail-page__page-title");
    expect(styles).toContain(".meal-detail-page__hero");
    expect(styles).toContain(".meal-detail-page__composition");
    expect(styles).toContain(".meal-detail-page__ingredient-row");
    expect(layoutStyles).toContain(".page-layout--portion-adjustment .page-layout__content");
    expect(layoutStyles).toContain(".page-layout--meal-detail .page-layout__content");
  });
});
