import { Image, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { AppButton } from "../../components/app-button";
import { BottomSheet, bottomSheetExitDuration } from "../../components/bottom-sheet";
import { NordicIcon } from "../../components/nordic-icon";
import { EmptyState } from "../../components/empty-state";
import { SearchBar } from "../../components/search-bar";
import {
  clampProgress,
  getMealNutrition,
  shiftDate,
  type Meal,
  type MealType,
} from "../../features/meals/domain";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { type MealTypeFilter, useMealStore } from "../../stores/meal-store";
import { useTabBarStore } from "../../stores/tab-bar-store";
import bowlImage from "../../assets/meal-bowl.svg";
import oatsImage from "../../assets/meal-oats.svg";
import salmonImage from "../../assets/meal-salmon.svg";

const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };
const weekLabels = ["日", "一", "二", "三", "四", "五", "六"];
const mealLabels: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};
const filterOptions: Array<{ value: MealTypeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
  { value: "snack", label: "加餐" },
  { value: "favorite", label: "收藏" },
];

function getWeekDays(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  const selected = new Date(year, month - 1, day);
  const firstDay = shiftDate(date, -selected.getDay());
  return Array.from({ length: 7 }, (_, index) => shiftDate(firstDay, index));
}

function getDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function TimelineMeal({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  const nutrition = getMealNutrition(meal);
  return (
    <View className="meal-records-page__timeline-item" onClick={onClick}>
      <View className="meal-records-page__timeline-marker" />
      <View className="meal-records-page__meal-card">
        <View
          className={`meal-records-page__meal-visual meal-records-page__meal-visual--${meal.imageKey ?? "empty"}`}
        >
          {meal.imageKey ? (
            <Image
              className="meal-records-page__meal-image"
              src={imageByKey[meal.imageKey]}
              mode="aspectFill"
            />
          ) : (
            <NordicIcon name="circle-plus" size={20} ariaLabel="加餐" />
          )}
        </View>
        <View className="meal-records-page__meal-copy">
          <Text className="meal-records-page__meal-title">{meal.title}</Text>
          <Text className="meal-records-page__meal-meta">
            {mealLabels[meal.mealType]} · {meal.time}
          </Text>
          <View className="meal-records-page__meal-tags">
            <Text>{nutrition.protein}g 蛋白质</Text>
            <Text>{nutrition.carbs}g 碳水</Text>
          </View>
        </View>
        <Text className="meal-records-page__meal-kcal">{nutrition.calories}</Text>
      </View>
    </View>
  );
}

export default function MealRecordsPage() {
  const store = useMealStore();
  const setTabBarVisible = useTabBarStore((state) => state.setVisible);
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);
  const [filterOpen, setFilterOpen] = useState(false);
  const today = getLocalDateString();
  const summary = store.getDailySummary();
  const meals = store.filterMeals();
  const weekDays = useMemo(() => getWeekDays(store.selectedDate), [store.selectedDate]);
  const selectedDateParts = getDateParts(store.selectedDate);
  const calorieProgress = clampProgress(summary.consumed.calories, summary.calories);
  const maxDate = getLocalDateString(7);
  const openDetail = (id: string) => Taro.navigateTo({ url: `/pages/meal-detail/index?id=${id}` });
  const addMeal = () => {
    setActiveKey("food-scanner");
    void Taro.switchTab({ url: "/pages/food-scanner/index" });
  };
  const openManualMeal = () => {
    setFilterOpen(false);
    void Taro.navigateTo({ url: "/pages/manual-meal/index" });
  };
  const clearFilters = () => {
    store.setSearchKeyword("");
    store.setMealTypeFilter("all");
  };
  const hasFilters = Boolean(store.searchKeyword) || store.mealTypeFilter !== "all";
  const changeWeek = (offset: number) => {
    const nextDate = shiftDate(store.selectedDate, offset);
    if (nextDate <= maxDate) store.setSelectedDate(nextDate);
  };

  useEffect(() => {
    if (filterOpen) {
      setTabBarVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setTabBarVisible(true), bottomSheetExitDuration);
    return () => clearTimeout(timer);
  }, [filterOpen, setTabBarVisible]);

  useEffect(() => () => setTabBarVisible(true), [setTabBarVisible]);

  return (
    <PageLayout
      title="饮食记录"
      activeTab="meal-records"
      hideNavigation
      className="page-layout--meal-records"
    >
      <View className="meal-records-page">
        <View className="meal-records-page__header">
          <Text className="meal-records-page__header-title">饮食记录</Text>
          <View
            className="meal-records-page__header-more"
            ariaLabel="筛选记录"
            onClick={() => setFilterOpen(true)}
          >
            <NordicIcon name="ellipsis" size={22} />
          </View>
        </View>

        <SearchBar
          value={store.searchKeyword}
          placeholder="搜索餐次或食材"
          onInput={store.setSearchKeyword}
          onClear={() => store.setSearchKeyword("")}
        />

        <View className="meal-records-page__calendar">
          <View className="meal-records-page__calendar-head">
            <View
              className="meal-records-page__calendar-button"
              onClick={() => changeWeek(-7)}
              ariaLabel="上一周"
            >
              <NordicIcon name="back" size={18} />
            </View>
            <Text className="meal-records-page__calendar-title">
              {selectedDateParts.year} 年 {selectedDateParts.month} 月
            </Text>
            <View
              className="meal-records-page__calendar-button meal-records-page__calendar-button--next"
              onClick={() => changeWeek(7)}
              ariaLabel="下一周"
            >
              <NordicIcon name="back" size={18} />
            </View>
          </View>
          <View className="meal-records-page__week-labels">
            {weekLabels.map((label) => (
              <Text key={label}>{label}</Text>
            ))}
          </View>
          <View className="meal-records-page__week-days">
            {weekDays.map((date) => {
              const { day } = getDateParts(date);
              const active = date === store.selectedDate;
              return (
                <View
                  key={date}
                  className={`meal-records-page__day ${active ? "meal-records-page__day--active" : ""}`}
                  onClick={() => store.setSelectedDate(date)}
                >
                  <Text>{day}</Text>
                </View>
              );
            })}
          </View>
        </View>

        <View className="meal-records-page__summary">
          <View className="meal-records-page__summary-head">
            <View>
              <Text className="meal-records-page__summary-label">当日汇总</Text>
              <Text className="meal-records-page__summary-kcal">
                {summary.consumed.calories}
                <Text> / {summary.calories} kcal</Text>
              </Text>
            </View>
            <NordicIcon name="list-checks" size={26} />
          </View>
          <View className="meal-records-page__summary-track">
            <View style={{ width: `${calorieProgress.percent}%` }} />
          </View>
          <View className="meal-records-page__summary-macros">
            {[
              ["蛋白质", summary.consumed.protein],
              ["碳水", summary.consumed.carbs],
              ["脂肪", summary.consumed.fat],
            ].map(([label, value]) => (
              <View key={label}>
                <Text>{label}</Text>
                <Text>{value}g</Text>
              </View>
            ))}
          </View>
        </View>

        <Text className="meal-records-page__section-title">今日餐次</Text>
        {meals.length === 0 ? (
          <EmptyState
            title={
              hasFilters
                ? "没有符合条件的餐次"
                : store.selectedDate > today
                  ? "未来日期还没有餐次"
                  : "当天没有记录"
            }
            description={hasFilters ? "换个关键词或清除筛选再试试。" : "可以从新增餐次开始。"}
            actionLabel={hasFilters ? "清除筛选" : "新增餐次"}
            onAction={hasFilters ? clearFilters : addMeal}
          />
        ) : (
          <View className="meal-records-page__timeline">
            {meals.map((meal) => (
              <TimelineMeal key={meal.id} meal={meal} onClick={() => openDetail(meal.id)} />
            ))}
          </View>
        )}
        <View className="meal-records-page__fab" onClick={addMeal} ariaLabel="新增餐次">
          <NordicIcon name="circle-plus" size={30} />
        </View>
      </View>
      <BottomSheet
        open={filterOpen}
        className="records-filter-sheet"
        onDismiss={() => setFilterOpen(false)}
      >
        <View className="records-filter-sheet__content">
          <View className="records-filter-sheet__header">
            <Text>筛选记录</Text>
            <View ariaLabel="关闭筛选" onClick={() => setFilterOpen(false)}>
              <NordicIcon name="x" size={20} ariaLabel="关闭" />
            </View>
          </View>
          <Text className="records-filter-sheet__lead">
            按餐次类型或收藏状态查看当天的饮食记录。
          </Text>
          <View className="records-filter-sheet__chips">
            {filterOptions.map((option) => (
              <View
                className={`records-filter-sheet__chip ${store.mealTypeFilter === option.value ? "records-filter-sheet__chip--active" : ""}`}
                key={option.value}
                onClick={() => store.setMealTypeFilter(option.value)}
              >
                <Text>{option.label}</Text>
              </View>
            ))}
          </View>
          <View className="records-filter-sheet__actions">
            <AppButton variant="outline" size="medium" onClick={clearFilters}>
              清除筛选
            </AppButton>
            <AppButton size="medium" onClick={() => setFilterOpen(false)}>
              完成
            </AppButton>
          </View>
          <View className="records-filter-sheet__manual" onClick={openManualMeal}>
            <NordicIcon name="circle-plus" size={20} ariaLabel="手动记录" />
            <Text>不方便拍照？手动记录一餐</Text>
          </View>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
