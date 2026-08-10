import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("meal records calendar search and filters", () => {
  it("expands a full-month calendar beside the month title", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/meal-records/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");

    expect(page).toContain("monthExpanded");
    expect(page).toContain("meal-records-page__calendar-expand");
    expect(page).toContain("getMonthGrid");
    expect(page).toContain("getProductMealsRange");
    expect(styles).toContain(".meal-records-page__month-grid");
    expect(styles).toContain(".meal-records-page__calendar-expand--open");
  });

  it("marks recorded days with a soft circular fill only, and shows macro icons", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/meal-records/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");

    expect(page).toContain("start: weekDays[0], end: weekDays[6]");
    expect(page).toContain('hasRecord ? "meal-records-page__day--recorded"');
    expect(page).not.toContain("meal-records-page__day-mark");
    expect(page).toContain('icon: "protein"');
    expect(page).toContain('icon: "carbs"');
    expect(page).toContain('icon: "fat"');
    expect(styles).toContain(".meal-records-page__day--recorded text");
    expect(styles).not.toContain(".meal-records-page__day-mark");
    expect(styles).toContain(".meal-records-page__summary-macro-label");
    expect(styles).not.toContain(".meal-records-page__day-dot");
  });

  it("keeps search icon sized with body text and nests the filter trigger in the search bar", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/meal-records/index.tsx"), "utf8");
    const searchBar = readFileSync(resolve(sourceRoot, "components/search-bar/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/components.scss"), "utf8");

    expect(searchBar).toContain('name="search"');
    expect(searchBar).toContain("size={28}");
    expect(searchBar).toContain("trailing");
    expect(page).toContain("trailing={");
    expect(page).toContain("meal-records-page__filter-trigger");
    expect(page).not.toContain("meal-records-page__filter-btn");
    expect(styles).toContain(".search-bar__trailing");
  });

  it("exposes a favorites filter in the compact filter sheet", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/meal-records/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");

    expect(page).toContain("records-filter-sheet__section");
    expect(page).toContain("按餐次类型或收藏查看当天的饮食记录。");
    expect(page).toMatch(
      /value: "snack", label: "加餐"[\s\S]*value: "favorite", label: "仅看收藏"/,
    );
    expect(page).toContain('name="heart-filled"');
    expect(page).not.toContain("records-filter-sheet__close");
    expect(page).toContain("records-filter-sheet__manual-copy");
    expect(styles).toContain(".records-filter-sheet__chips");
    expect(styles).toContain("flex-wrap: wrap");
    expect(styles).toContain("white-space: nowrap");
    expect(styles).toContain("min-height: 0");
    expect(styles).toContain(".records-filter-sheet__manual-meta");
  });

  it("does not let stale date responses overwrite the currently selected day", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/meal-records/index.tsx"), "utf8");
    const dailySync = page.slice(
      page.indexOf("useEffect(() => {\n    const selectedDate = store.selectedDate;"),
      page.indexOf("  useEffect(() => {\n    const searching"),
    );

    expect(dailySync).toContain("const selectedDate = store.selectedDate;");
    expect(dailySync).toContain("getProductDailySummary(selectedDate)");
    expect(dailySync.match(/if \(cancelled\) return;/g)).toHaveLength(3);
    expect(dailySync).toContain("getProductMeals(selectedDate)");
    expect(dailySync).toContain("store.replaceRemoteMeals(remoteMeals, selectedDate);");
    expect(dailySync).not.toContain("store.replaceRemoteMeals(remoteMeals, store.selectedDate);");
  });
});
