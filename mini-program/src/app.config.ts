const pages = [
    "pages/onboarding/index",
    "pages/body-profile/index",
    "pages/diet-preferences/index",
    "pages/nutrition-plan/index",
    "pages/home/index",
    "pages/food-scanner/index",
    "pages/manual-meal/index",
    "pages/analysis-result/index",
    "pages/portion-adjustment/index",
    "pages/meal-detail/index",
    "pages/ingredient-detail/index",
    "pages/meal-records/index",
    "pages/coach/index",
    "pages/profile/index",
    "pages/profile-edit/index",
    "pages/goal-adjust/index",
    "pages/achievements/index",
    "pages/weekly-review/index",
];

if (process.env.TARO_APP_ENV === "development") pages.push("pages/dev-auth-harness/index");

export default defineAppConfig({
  pages,
  window: {
    navigationStyle: "custom",
    navigationBarBackgroundColor: "#faf9f6",
    navigationBarTextStyle: "black",
    navigationBarTitleText: "Nordic Nutri AI",
    backgroundColor: "#faf9f6",
  },
  tabBar: {
    custom: true,
    color: "#69716b",
    selectedColor: "#153f2b",
    backgroundColor: "#ffffff",
    borderStyle: "white",
    list: [
      { pagePath: "pages/home/index", text: "首页" },
      { pagePath: "pages/food-scanner/index", text: "扫描" },
      { pagePath: "pages/meal-records/index", text: "记录" },
      { pagePath: "pages/coach/index", text: "教练" },
      { pagePath: "pages/profile/index", text: "我的" },
    ],
  },
});
