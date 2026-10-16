import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createCoachAdvice, createAchievements } from "../src/features/coach/domain";
import { createAchievementStore } from "../src/stores/achievement-store";
import { createCoachStore } from "../src/stores/coach-store";
import { createMealFixtures } from "../src/features/meals/domain";
import { createProfileStore } from "../src/stores/profile-store";
import { expectLocalizedCopy } from "./i18n-source-assertions";

const coachPageSource = () =>
  readFileSync(resolve(import.meta.dirname, "../src/pages/coach/index.tsx"), "utf8");

describe("local coach and profile", () => {
  it("generates coach advice from local meals", () => {
    const advice = createCoachAdvice(createMealFixtures("2026-07-13"), "2026-07-13");
    expect(advice.length).toBeGreaterThan(0);
    expect(advice[0]?.message).toContain("蛋白");
  });
  it("supports favorite, dismiss and regenerate local advice", () => {
    const store = createCoachStore();
    store.getState().setAdvice(createCoachAdvice(createMealFixtures("2026-07-13"), "2026-07-13"));
    const id = store.getState().advice[0]!.id;
    store.getState().toggleFavorite(id);
    store.getState().dismiss(id);
    expect(store.getState().advice[0]?.favorite).toBe(true);
    expect(store.getState().advice[0]?.dismissed).toBe(true);
  });
  it("calculates at least twenty achievements and keeps local settings", () => {
    const achievements = createAchievements(createMealFixtures("2026-07-13"), "2026-07-13");
    expect(achievements.length).toBeGreaterThanOrEqual(20);
    const store = createAchievementStore();
    store.getState().setAchievements(achievements);
    expect(store.getState().achievements.length).toBeGreaterThanOrEqual(20);
    const profile = createProfileStore();
    profile.getState().setSetting("theme", "dark");
    expect(profile.getState().settings.theme).toBe("dark");
  });

  it("shares one cached system-layout snapshot across headers rendered in the same frame", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/hooks/useSystemLayout.ts"), "utf8");

    expect(source).toContain("function getCachedLayout()");
    expect(source).toContain("cachedLayout = computeMetrics()");
    expect(source).not.toContain("useEffect");
  });

  it("uses the requested coach title without the duplicate intro identity", () => {
    const source = coachPageSource();
    const titleStart = source.indexOf('className="coach-chat__page-title"');
    const titleEnd = source.indexOf('className="coach-chat__status"');

    expectLocalizedCopy(source, "你的营养教练");
    expect(source.slice(titleStart, titleEnd)).not.toContain("你的营养教练");
    expect(source.slice(titleStart, titleEnd)).not.toContain("NordicIcon");
    expect(source).not.toContain("coach-chat__avatar");
    expect(source).not.toContain("coach-chat__eyebrow");
  });

  it("keeps the Coach tab focused on a daily action and direct conversation", () => {
    const source = coachPageSource();
    const composer = readFileSync(
      resolve(import.meta.dirname, "../src/pages/coach/components/CoachComposer/index.tsx"),
      "utf8",
    );

    expectLocalizedCopy(source, "NOVA · 今日提醒");
    expectLocalizedCopy(composer, "问问营养教练");
    expect(source).toContain('className="coach-chat__hero-greeting"');
    expect(source).toContain('className="coach-chat__hero-summary"');
    expect(source).toContain('className="coach-chat__hero-suggestion"');
    expect(source).not.toContain('className="coach-chat__status-badge"');
    expect(source).not.toContain('className="coach-chat__suggestion-product"');
    expect(source).not.toContain("addSuggestedSnack");
    expect(source).toContain("quickPrompts.slice(0, 4).map");
    expect(source).toContain('className="coach-chat__quick-chip-text"');
    expect(source).not.toContain('className="coach-chat__hero-actions"');
    expect(source).toContain('"查看今日进度": "coachPage.context.viewProgress"');

    const pageStyles = readFileSync(
      resolve(import.meta.dirname, "../src/styles/page.scss"),
      "utf8",
    );
    expect(pageStyles).toContain(".coach-chat__quick-actions {\n  display: flex;");
    expect(pageStyles).toContain("justify-content: center;");
    expect(pageStyles).toContain("flex-wrap: wrap;");
  });

  it("keeps restart parallel to NOVA and places the dynamic question below the nutrition tip", () => {
    const source = coachPageSource();
    const toolbarStart = source.indexOf('className="coach-chat__hero-toolbar"');
    const greetingStart = source.indexOf('className="coach-chat__hero-greeting"');
    const tipCopy = source.indexOf('className="coach-chat__suggestion-copy"');
    const tipQuestion = source.indexOf('className="coach-chat__suggestion-question"');

    expect(toolbarStart).toBeGreaterThan(-1);
    expect(source.indexOf('className="coach-chat__hero-kicker"', toolbarStart)).toBeGreaterThan(toolbarStart);
    expect(source.indexOf('className="coach-chat__restart-action"', toolbarStart)).toBeGreaterThan(toolbarStart);
    expect(greetingStart).toBeGreaterThan(toolbarStart);
    expect(tipQuestion).toBeGreaterThan(tipCopy);
  });

  it("raises the hero copy and safety note clear of the fixed composer", () => {
    const styles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");

    expect(styles).toContain("padding: $space-16 $space-16 $space-16;");
    expect(styles).toContain(".coach-chat__safety-note {\n  color: $color-text-secondary;\n  font-size: $font-overline;\n  line-height: $line-caption;\n  margin-bottom: $space-16;");
  });

  it("scrolls to the page bottom after a completed coach reply", () => {
    const source = coachPageSource();

    expect(source).toContain("setCompletedReplyVersion");
    expect(source).toContain("scrollToCoachBottom();");
  });

  it("jumps to the latest message when sending and while a reply streams", () => {
    const source = coachPageSource();
    const sendMessageStart = source.indexOf("const sendMessage = async");
    const sendMessageEnd = source.indexOf("const scrollToCoachTop", sendMessageStart);
    const sendMessageSource = source.slice(sendMessageStart, sendMessageEnd);

    expect(source).toContain("const scrollToCoachBottom");
    expect(source).toContain("bottomScrollTimerRef");
    expect(source).toContain("Taro.pageScrollTo({ scrollTop: 999999, duration: 0 })");
    expect(sendMessageSource).toContain("scrollToCoachBottom();");
    expect(sendMessageSource).toContain("event.type === \"delta\"");
  });

  it("keeps a right-aligned fixed control without a full-screen gesture layer", () => {
    const source = coachPageSource();
    const styles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");

    expect(source).not.toContain("MovableArea");
    expect(source).not.toContain("MovableView");
    expect(source).toContain('className="coach-chat__scroll-top"');
    expectLocalizedCopy(source, "回到顶部");
    expect(source).toContain("Taro.pageScrollTo({ scrollTop: 0, duration: 300 })");
    expect(source).toContain('name="arrow-up" size={22}');
    expect(source).toContain("onClick={scrollToCoachTop}");
    const overlayStart = source.indexOf("overlay={");
    const scrollTopStart = source.indexOf('className="coach-chat__scroll-top"');
    const pageClassStart = source.indexOf('className="page-layout--coach-chat"');
    expect(scrollTopStart).toBeGreaterThan(overlayStart);
    expect(scrollTopStart).toBeLessThan(pageClassStart);
    expect(styles).toContain(".coach-chat__scroll-top");
    expect(styles).toContain("right: $space-12;");
    expect(styles).toContain("position: fixed;");
    expect(styles).toContain("top: 40vh;");
    expect(styles).toContain("z-index: 90;");
    expect(styles).toContain("background: rgba($color-warm-white, 0.78);");
    expect(styles).toContain("border: 1px solid rgba($color-forest-green, 0.48);");
  });

  it("keeps progress, quick replies, composer, and tab bar in separate vertical lanes", () => {
    const source = coachPageSource();
    const composer = readFileSync(
      resolve(import.meta.dirname, "../src/pages/coach/components/CoachComposer/index.tsx"),
      "utf8",
    );
    const pageStyles = readFileSync(
      resolve(import.meta.dirname, "../src/styles/page.scss"),
      "utf8",
    );
    const composerStyles = readFileSync(
      resolve(import.meta.dirname, "../src/pages/coach/components/CoachComposer/index.scss"),
      "utf8",
    );
    const layoutStyles = readFileSync(
      resolve(import.meta.dirname, "../src/styles/layout.scss"),
      "utf8",
    );

    expect(source).toContain('className="coach-chat__bottom-tools"');
    expect(source).not.toContain('className="coach-chat__score"');
    expect(source).not.toContain("今日营养评分");
    expect(source).not.toContain('variant="hero"');
    expect(source).toContain("coach-chat__section-toggle");
    expect(composer).toContain("coach-composer__image-picker");
    expect(composer).toContain('name="camera"');
    expect(source).toContain('name="chevron-right"');
    expect(source).toContain("coach-chat__section-toggle--expanded");
    expect(source).toContain("coach-chat__section-toggle--collapsed");
    expect(source).toContain('className="coach-chat__progress-score-group"');
    expect(composer.indexOf("coach-composer__image-picker")).toBeLessThan(
      composer.indexOf("coach-composer__send"),
    );
    expect(pageStyles).toContain(".coach-chat__bottom-tools");
    expect(pageStyles).toContain(".coach-chat__section-toggle");
    expect(composerStyles).toContain(".coach-composer__image-picker");
    expect(pageStyles).toContain(".coach-chat__section-toggle--expanded .nordic-icon");
    expect(pageStyles).toContain(".coach-chat__progress-score-group");
    expect(pageStyles).not.toContain('[aria-label*="展开"]');
    expect(pageStyles).not.toContain(".coach-chat__progress-heading > :last-child");
    expect(pageStyles).not.toContain(".coach-chat__score {");
    expect(layoutStyles).toContain(
      "padding-bottom: calc($tabbar-height + $safe-area-bottom + 112px);",
    );
  });

  it("uses NOVA only in coach messages and reserves a streaming message state", () => {
    const source = coachPageSource();
    const styles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");

    expect(source).toContain("CoachAvatar");
    expect(source).toContain('className="coach-chat__hero"');
    expect(source).toContain('className="coach-chat__progress-card"');
    expect(source).toContain('"coach-chat__streaming-copy"');
    expect(source).toContain('status="idle"');
    expect(source).toContain("<AnalysisProgress");
    expect(source).not.toContain('<CoachAvatar variant="hero"');
    expect(source).not.toContain('name="bot"');
    expect(styles).toContain(".coach-chat__hero");
    expect(styles).toContain(".coach-chat__progress-card");
  });

  it("places progress before the secondary suggestion and conversation after the NOVA hero", () => {
    const source = coachPageSource();

    const hero = source.indexOf('className="coach-chat__hero"');
    const suggestion = source.indexOf('className="coach-chat__suggestion"');
    const progress = source.indexOf('className="coach-chat__progress-card"');
    const conversation = source.indexOf('className="coach-chat__conversation"');

    expect(hero).toBeGreaterThan(-1);
    expect(progress).toBeGreaterThan(hero);
    expect(suggestion).toBeGreaterThan(progress);
    expect(conversation).toBeGreaterThan(suggestion);
  });

  it("uses a coach-aligned personal-center header and synchronizes tab selection from profile metrics", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );

    expectLocalizedCopy(source, "个人中心");
    expect(source).toContain('page-layout--profile-android profile-stitch');
    expect(source).not.toContain('className="profile-page-title"');
    expect(source).not.toContain('title="我的节奏"');
    expect(source).not.toContain('className="profile-rhythm__goal-progress"');
    expect(source).not.toContain("把目标、记录与改变放在同一张地图上。");
    const androidOverview = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/android-overview.tsx"), "utf8");
    expectLocalizedCopy(androidOverview, "蛋白完成度");
    expectLocalizedCopy(androidOverview, "本周回顾");
    expect(source).toContain('setActiveKey("coach")');
    expect(source).toContain('Taro.switchTab({ url: "/pages/coach/index" })');
    expect(source).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
    expect(source).not.toContain('title="Theme"');
    expect(source).not.toContain('title="Language"');
  });

  it("refreshes the weekly rhythm score when the profile page is shown again", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );
    const didShowStart = source.indexOf("useDidShow(() => {");
    const didShowEnd = source.indexOf("\n  });", didShowStart);
    const didShow = source.slice(didShowStart, didShowEnd);

    expect(didShow).toContain("getProductWeeklyReview(date, { preferFast: true })");
    expect(didShow).toContain("setWeeklyReview");
  });

  it("routes the profile hub to complete local profile pages without legacy settings", () => {
    const appConfig = readFileSync(resolve(import.meta.dirname, "../src/app.config.ts"), "utf8");
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );

    ["profile-edit", "goal-adjust", "achievements", "weekly-review"].forEach((page) => {
      expect(appConfig).toContain(`pages/${page}/index`);
    });
    ["profile-edit", "achievements", "weekly-review"].forEach((page) => {
      expect(source).toContain(`/pages/${page}/index`);
    });
    expect(source).toContain("/pages/body-profile/index?from=settings&entry=1");
    expectLocalizedCopy(source, "营养档案");
    expect(source).not.toContain('title="身体资料"');
    expect(source).not.toContain('title="饮食偏好"');
    expectLocalizedCopy(source, "身体数据、饮食偏好与忌口");
    expect(source).not.toContain("formatDietPreferencesSummary");
    expect(source).not.toContain("nutritionProfileSummary");
    expect(source).toContain("/pages/goal-adjust/index");
    expect(appConfig).toContain("pages/privacy-policy/index");
    expectLocalizedCopy(source, "隐私政策与免责声明");
    expect(source).toContain("/pages/privacy-policy/index");
    expect(source).toContain('className="profile-feedback-title"');
    expectLocalizedCopy(source, "反馈与帮助");
    expectLocalizedCopy(source, "关于我们");
    expect(source).not.toContain('title="主题"');
    expect(source).not.toContain('title="语言"');
    expect(source).not.toContain('title="提醒"');
    expect(source).not.toContain("导出本地数据");
  });

  it("routes privacy to its policy page and keeps feedback and about as modals", () => {
    const source = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile/index.tsx"),
      "utf8",
    );

    const policy = readFileSync(
      resolve(import.meta.dirname, "../src/pages/privacy-policy/index.tsx"),
      "utf8",
    );
    expect(source).not.toContain('activeModal === "privacy"');
    expect(policy).toContain("{section.content}");
    expectLocalizedCopy(policy, "注销 Nordic Nutri 账号");
    expect(source).toContain('activeModal === "feedback"');
    expectLocalizedCopy(source, "提交反馈");
    expect(source).toContain('activeModal === "about"');
    expectLocalizedCopy(source, "帮助你轻松看见、理解并记录每一餐");
    expectLocalizedCopy(source, "不构成医疗诊断或治疗建议");
    expect(source).not.toContain(">知道了<");
  });

  it("provides local profile and goal forms backed by the profile store", () => {
    const profileEdit = readFileSync(
      resolve(import.meta.dirname, "../src/pages/profile-edit/index.tsx"),
      "utf8",
    );
    const goalAdjust = readFileSync(
      resolve(import.meta.dirname, "../src/pages/goal-adjust/index.tsx"),
      "utf8",
    );

    expect(profileEdit).toContain("profile.setProfile");
    expectLocalizedCopy(profileEdit, "保存资料");
    expect(profileEdit).toContain('className="page-layout--profile-edit"');
    expect(profileEdit).not.toContain('className="profile-subpage__page-title"');
    expect(profileEdit).toContain('className="profile-edit__notice"');
    expect(profileEdit).toContain('className="profile-edit__action"');
    expectLocalizedCopy(profileEdit, "昵称会保存到你的账号");
    expect(profileEdit).not.toContain('eyebrow="我的节奏"');
    expect(profileEdit).not.toContain("保留最重要的信息，让目标更贴合现在的你。");
    expect(goalAdjust).toContain("profile.setProfile");
    expectLocalizedCopy(goalAdjust, "保存今日目标");
    expect(goalAdjust).toContain("saveProductNutritionPlan");
  });

  it("uses coach-aligned headers for achievements and weekly review without the removed lead copy", () => {
    const achievements = readFileSync(
      resolve(import.meta.dirname, "../src/pages/achievements/index.tsx"),
      "utf8",
    );
    const weeklyReview = readFileSync(
      resolve(import.meta.dirname, "../src/pages/weekly-review/index.tsx"),
      "utf8",
    );

    expectLocalizedCopy(achievements, "全部成就");
    expect(achievements).toContain("createAchievements");
    expect(achievements).toContain('className="page-layout--achievements"');
    expect(achievements).toContain('className="profile-subpage__page-title"');
    expect(achievements).not.toContain("继续记录，让每一餐都成为节奏。");
    expectLocalizedCopy(weeklyReview, "本周回顾");
    expect(weeklyReview).toContain('className="page-layout--weekly-v2"');
    expect(weeklyReview).not.toContain('className="profile-subpage__page-title"');
    expect(weeklyReview).toContain('className="weekly-v2__score-row"');
    expect(weeklyReview).not.toContain("看见已经做到的，再决定下一步。");
    expect(weeklyReview).toContain('className="weekly-v2__week"');
    expectLocalizedCopy(weeklyReview, "本周节奏");
    expect(weeklyReview).toContain("getProductWeeklyReview(date");
    expect(weeklyReview).not.toContain("day - (6 - index)");
    expectLocalizedCopy(weeklyReview, "下周小目标");
    expect(weeklyReview).toContain("review.recordedDays");
  });
});
