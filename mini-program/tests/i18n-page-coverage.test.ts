import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";
import zhTW from "../src/i18n/locales/zh-TW.json";

const page = (name: string) => readFileSync(resolve(import.meta.dirname, `../src/pages/${name}/index.tsx`), "utf8");

describe("main journey translation coverage", () => {
  it.each(["welcome", "auth-entry", "home", "weekly-review", "meal-records", "food-catalog", "manual-meal", "food-detail", "coach", "food-scanner", "meal-detail", "analysis-result", "profile"]) ("moves core %s copy into locale resources", (name) => {
    const source = page(name);
    expect(source).not.toMatch(/拍一餐，营养心中有数|继续你的营养节奏|今日目标|正在整理本周记录|记录不足，暂不作营养判断|搜索餐次或食材|正在加载食物库|请填写这一餐的名称|没有可展示的食物|你的营养教练|快捷提问|营养建议仅供日常饮食参考|食物扫描|拍摄并分析|今日识别次数已用完|餐食详情|营养构成|删除这餐|营养分析|保存本餐|识别食材|个人中心|反馈提交失败/);
  });

  it("translates the Android profile overview actually shown in the app", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/pages/profile/android-overview.tsx"), "utf8");
    expect(source).not.toMatch(/编辑个人资料|成长概览|本周萌芽周期|查看完整健康旅程|成就尚未加载|本周回顾/);
    for (const locale of [en, zhCN, zhTW]) expect(locale.profileOverview.weeklyReview).toBeTruthy();
  });

  it.each(["profile-edit", "goal-adjust"])("translates %s forms and dialogs", (name) => {
    expect(page(name)).not.toMatch(/保存今日目标|调整今日目标|目标保存失败|资料保存失败|更换头像|确认更新目标方向/);
    for (const locale of [en, zhCN, zhTW]) expect(locale[name === "profile-edit" ? "profileEdit" : "goalAdjust"].title).toBeTruthy();
  });

  it("translates saved-meal filters, states, and actions", () => {
    expect(page("frequent-meals")).not.toMatch(/我的常吃|正在加载你的常吃|还没有保存常吃|一键记录|删除常吃/);
    for (const locale of [en, zhCN, zhTW]) expect(locale.frequentMeals.title).toBeTruthy();
  });

  it.each(["body-profile", "nutrition-plan"])("translates %s onboarding and settings copy", (name) => {
    expect(page(name)).not.toMatch(/title: "身体资料保存失败"|>基础信息与生活方式<|>日常活动量<|"新的计划已准备好"|>每日目标<|>第一阶段里程碑<|"开始我的计划"/);
    for (const locale of [en, zhCN, zhTW]) expect(locale[name === "body-profile" ? "bodyProfile" : "nutritionPlan"].title).toBeTruthy();
  });

  it("provides the new main-journey keys in all three languages", () => {
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.welcome.title).toBeTruthy();
      expect(locale.authEntry.title).toBeTruthy();
      expect(locale.home.dailyTarget).toBeTruthy();
      expect(locale.weekly.insufficientRecords).toBeTruthy();
      expect(locale.records.searchPlaceholder).toBeTruthy();
      expect(locale.foodCatalog.loading).toBeTruthy();
      expect(locale.manualMeal.title).toBeTruthy();
      expect(locale.foodDetail.emptyTitle).toBeTruthy();
      expect(locale.coachPage.title).toBeTruthy();
      expect(locale.scannerPage.title).toBeTruthy();
      expect(locale.mealDetail.title).toBeTruthy();
      expect(locale.analysisResult.title).toBeTruthy();
    }
  });

  it("localizes reminder settings and saved-meal editing in all supported locales", () => {
    expect(page("smart-reminder-settings")).not.toMatch(/餐次推送排程|通知权限未开启|记录提醒|每个餐次每天最多提醒一次/);
    expect(page("frequent-meal-edit")).not.toMatch(/编辑常吃|放弃未保存的修改|保存失败，修改已保留|默认餐次/);
    expect(page("recommend-friends")).not.toMatch(/推荐好友|海报已保存到相册/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.smartReminders.title).toBeTruthy();
      expect(locale.reminderTime.save).toBeTruthy();
      expect(locale.reminderAlarm.confirm).toBeTruthy();
      expect(locale.reminderPaused.title).toBeTruthy();
      expect(locale.frequentMealEdit.title).toBeTruthy();
      expect(locale.recommendFriends.title).toBeTruthy();
    }
  });

  it("localizes portion adjustment and dietary preference choices", () => {
    expect(page("portion-adjustment")).not.toMatch(/当前餐食|调整后热量|份量比例|恢复原始份量|保存本餐/);
    expect(page("diet-preferences")).not.toMatch(/饮食偏好与限制|需要避开的食物|每日餐次|生成我的计划/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.portionAdjustment.title).toBeTruthy();
      expect(locale.dietPreferences.title).toBeTruthy();
      expect(locale.dietPreferences.pattern.vegetarianDescription).toBeTruthy();
      expect(locale.dietPreferences.avoidance.gluten).toBeTruthy();
    }
  });

  it("localizes privacy information and account cancellation warnings", () => {
    expect(page("privacy-policy")).not.toMatch(/隐私政策与免责声明|收集的信息|你的记录与健康信息/);
    expect(page("account-cancellation")).not.toMatch(/注销后无法恢复|确认删除范围|确认注销并删除数据/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.privacyPolicy.sections[0].title).toBeTruthy();
      expect(locale.accountCancellation.deleteScope).toBeTruthy();
    }
  });

  it("localizes the milestone journey and its stage cards and sheets", () => {
    expect(page("milestone-journey")).not.toMatch(/我的旅程暂时无法读取|连续记录 \{streakDays\}|你已完成本周期全部里程碑|记录属于你的每一个阶段/);
    const card = readFileSync(resolve(import.meta.dirname, "../src/components/milestone-stage-card/index.tsx"), "utf8");
    const sheet = readFileSync(resolve(import.meta.dirname, "../src/components/milestone-stage-sheet/index.tsx"), "utf8");
    expect(card).not.toMatch(/已解锁|未解锁|还差/);
    expect(sheet).not.toMatch(/这一阶段已经解锁|你的里程碑海报正在等待展示|继续记录/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.milestoneJourney.title).toBeTruthy();
      expect(locale.milestoneJourney.stages.start.message).toBeTruthy();
      expect(locale.milestoneJourney.stages.lifestyle.title).toBeTruthy();
    }
  });

  it("localizes the milestone poster page and illustration gallery", () => {
    const poster = page("milestone-poster");
    const gallery = readFileSync(resolve(import.meta.dirname, "../src/components/milestone-stage-gallery/index.tsx"), "utf8");
    expect(poster).not.toMatch(/里程碑海报读取失败|预览数据 · 不会写入数据库|缺少里程碑事件信息|重新尝试/);
    expect(gallery).not.toMatch(/本次解锁|上一张插画|下一张插画|左右滑动查看/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.milestonePoster.pageTitle).toBeTruthy();
      expect(locale.milestonePoster.notReady).toBeTruthy();
      expect(locale.milestoneGallery.frozen).toBeTruthy();
      expect(locale.milestoneGallery.previous).toBeTruthy();
      expect(locale.milestoneGallery.hint).toBeTruthy();
    }
  });

  it("localizes recognition feedback sheet labels without translating meal content", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/components/recognition-feedback-sheet/index.tsx"), "utf8");
    expect(source).not.toMatch(/识别不准确？|选择要移除的食物|补充遗漏的食物|告诉我们哪里不准确|自动估算|正在分析食物/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.recognitionFeedback.title.reasons).toBeTruthy();
      expect(locale.recognitionFeedback.reasons.wrong_food.label).toBeTruthy();
      expect(locale.recognitionFeedback.missing.placeholder).toBeTruthy();
      expect(locale.recognitionFeedback.other.submit).toBeTruthy();
    }
  });

  it("localizes the shared meal-saved celebration", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/components/meal-saved-celebration/index.tsx"), "utf8");
    expect(source).not.toMatch(/已加入我的常吃|再吃一次已记录|本餐已更新|本餐已保存|今日进度|查看本餐|继续记录/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.mealSaved.title.created).toBeTruthy();
      expect(locale.mealSaved.subtitle.updated).toBeTruthy();
      expect(locale.mealSaved.nutrients.protein).toBeTruthy();
      expect(locale.mealSaved.viewMeal).toBeTruthy();
    }
  });

  it("localizes the Coach composer and analysis progress UI", () => {
    const composer = readFileSync(resolve(import.meta.dirname, "../src/pages/coach/components/CoachComposer/index.tsx"), "utf8");
    const progress = readFileSync(resolve(import.meta.dirname, "../src/pages/coach/components/AnalysisProgress/index.tsx"), "utf8");
    const progressDomain = readFileSync(resolve(import.meta.dirname, "../src/features/coach/analysis-progress.ts"), "utf8");
    expect(composer).not.toMatch(/问问营养教练|取消已选图片|选择饮食图片|选择图片|发送消息|ariaLabel="发送"/);
    expect(progress).not.toMatch(/已完成分析|收起分析摘要|展开分析摘要|ariaLabel="分析摘要"|ariaLabel="收起"|ariaLabel="展开"/);
    expect(progressDomain).not.toMatch(/正在分析你的饮食|正在整理营养信息|查看今日饮食记录|整理当前营养摄入|生成饮食建议|理解你的问题|整理相关营养信息|生成建议/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.coachPage.composer.placeholder).toBeTruthy();
      expect(locale.coachPage.composer.send).toBeTruthy();
      expect(locale.coachPage.analysisProgress.completed).toBeTruthy();
      expect(locale.coachPage.analysisProgress.dailyTitle).toBeTruthy();
      expect(locale.coachPage.analysisProgress.steps.generalStepQuestion).toBeTruthy();
      expect(locale.coachPage.analysisProgress.steps.dailyStepRecords).toBeTruthy();
    }
  });

  it("localizes achievement pages and their shared detail and unlock sheets", () => {
    const pageSource = page("achievements");
    const detail = readFileSync(resolve(import.meta.dirname, "../src/components/achievement-detail-sheet/index.tsx"), "utf8");
    const unlocked = readFileSync(resolve(import.meta.dirname, "../src/components/achievement-unlock-modal/index.tsx"), "utf8");
    expect(pageSource).not.toMatch(/全部成就|已收集 \{|点按卡片查看目标|即将上线|已解锁 · 查看时间|完成度 \{/);
    expect(detail).not.toMatch(/即将上线|已解锁|未解锁|达成时间|解锁目标|当前进度|轻触空白处关闭/);
    expect(unlocked).not.toMatch(/成就已解锁|收下这份成就|查看全部成就|关闭成就弹窗/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.achievements.title).toBeTruthy();
      expect(locale.achievements.count).toBeTruthy();
      expect(locale.achievements.states.upcoming).toBeTruthy();
      expect(locale.achievementDetail.progress).toBeTruthy();
      expect(locale.achievementUnlock.accept).toBeTruthy();
    }
  });

  it("localizes reusable empty, error, loading, search, and confirmation controls", () => {
    const readComponent = (name: string) => readFileSync(resolve(import.meta.dirname, `../src/components/${name}/index.tsx`), "utf8");
    expect(readComponent("empty-state")).not.toMatch(/还没有内容|完成下一步后|继续记录/);
    expect(readComponent("error-state")).not.toMatch(/暂时无法显示|本地内容暂时无法显示|重试/);
    expect(readComponent("loading-state")).not.toMatch(/正在准备内容/);
    expect(readComponent("search-bar")).not.toMatch(/搜索饮食记录|ariaLabel="搜索"|清除搜索/);
    expect(readComponent("confirm-dialog")).not.toMatch(/确认"|取消"/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.sharedUi.emptyTitle).toBeTruthy();
      expect(locale.sharedUi.errorTitle).toBeTruthy();
      expect(locale.sharedUi.searchPlaceholder).toBeTruthy();
    }
  });

  it("localizes meal summary, meal-group, recent-meal, and record-time controls", () => {
    const readComponent = (name: string) => readFileSync(resolve(import.meta.dirname, `../src/components/${name}/index.tsx`), "utf8");
    const summary = readComponent("daily-nutrition-summary");
    const hero = readComponent("meal-detail-hero");
    const recent = readComponent("recent-frequent-meals");
    const time = readComponent("record-time-editor");
    expect(summary).not.toMatch(/今日能量|热量完成|已超|剩余|今日已摄入/);
    expect(hero).not.toMatch(/查看本餐评分依据|本餐评分|查看原图|千卡/);
    expect(recent).not.toMatch(/最近常吃|查看全部|常吃推荐加载失败|多记录几餐|快速记录/);
    expect(time).not.toMatch(/修改记录时间|可修改|设置记录时间|调整日期|直接设置时间|前一天|后一天/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.sharedUi.mealGroupExpanded).toBeTruthy();
      expect(locale.dailySummary.energy).toBeTruthy();
      expect(locale.mealDetail.scoreBasis).toBeTruthy();
      expect(locale.recentMeals.title).toBeTruthy();
      expect(locale.recordTime.title).toBeTruthy();
    }
  });

  it("localizes the APK and app-market update dialog shell", () => {
    const source = readFileSync(resolve(import.meta.dirname, "../src/components/app-update-dialog/index.tsx"), "utf8");
    expect(source).not.toMatch(/正在安全下载|安装包校验完成|正在打开系统安装器|发现新版本|前往应用市场|直接下载 APK|稍后再说/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.appUpdate.title).toBeTruthy();
      expect(locale.appUpdate.status.downloading).toBeTruthy();
      expect(locale.appUpdate.market).toBeTruthy();
      expect(locale.appUpdate.later).toBeTruthy();
    }
  });

  it("localizes shared navigation, loading, form-icon and weekly-share fallback labels", () => {
    const readComponent = (name: string) => readFileSync(resolve(import.meta.dirname, `../src/components/${name}/index.tsx`), "utf8");
    expect(readComponent("app-top-bar")).not.toMatch(/ariaLabel="返回"|ariaLabel="首页"/);
    expect(readComponent("app-navbar")).not.toMatch(/NOVA 洞察/);
    expect(readComponent("loading")).not.toMatch(/正在准备营养视图/);
    expect(readComponent("feedback-modal")).not.toMatch(/aria-label="关闭"|ariaLabel="成功"|额度提示|primaryText === "好的"/);
    expect(page("onboarding")).not.toMatch(/ariaLabel="已选择"/);
    expect(page("weekly-review")).not.toMatch(/本周观察|下周每天至少记录一餐/);
    for (const locale of [en, zhCN, zhTW]) {
      expect(locale.sharedUi.success).toBeTruthy();
      expect(locale.sharedUi.limitReached).toBeTruthy();
      expect(locale.onboarding.selected).toBeTruthy();
      expect(locale.common.requestFailed).toBeTruthy();
    }
  });
});
