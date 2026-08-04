import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { AnimatedProgressBar } from "../../components/animated-progress-bar";
import { AppButton } from "../../components/app-button";
import { BottomSheet, bottomSheetExitDuration } from "../../components/bottom-sheet";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { EmptyState } from "../../components/empty-state";
import { ErrorState } from "../../components/error-state";
import { SearchBar } from "../../components/search-bar";
import { getFoodVisualFallback } from "../../features/food-catalog/food-visuals";
import {
  clampProgress,
  formatTargetStatus,
  getMealNutrition,
  shiftDate,
  type Meal,
  type MealType,
} from "../../features/meals/domain";
import { resolveHomeDailySummary } from "../../features/meals/home-daily-summary";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useAppShare } from "../../hooks/use-app-share";
import { getProductMeals, getProductMealsRange, mapProductMeal } from "../../api/meal-data-api";
import { getProductDailySummary, type ProductDailySummary } from "../../api/insight-api";
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
const mealTypeFilters: Array<{ value: MealTypeFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "breakfast", label: "早餐" },
  { value: "lunch", label: "午餐" },
  { value: "dinner", label: "晚餐" },
  { value: "snack", label: "加餐" },
  { value: "favorite", label: "仅看收藏" },
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

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function toDateString(year: number, month: number, day: number) {
  return `${year}-${padDatePart(month)}-${padDatePart(day)}`;
}

function getMonthGrid(date: string) {
  const { year, month } = getDateParts(date);
  const firstOfMonth = new Date(year, month - 1, 1);
  const daysInMonth = new Date(year, month, 0).getDate();
  const leading = firstOfMonth.getDay();
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  return Array.from({ length: totalCells }, (_, index) => {
    const dayOffset = index - leading + 1;
    const cellDate = new Date(year, month - 1, dayOffset);
    return {
      date: toDateString(cellDate.getFullYear(), cellDate.getMonth() + 1, cellDate.getDate()),
      inMonth: dayOffset >= 1 && dayOffset <= daysInMonth,
    };
  });
}

function getMonthRange(date: string) {
  const { year, month } = getDateParts(date);
  const start = toDateString(year, month, 1);
  const end = toDateString(year, month, new Date(year, month, 0).getDate());
  return { start, end };
}

function shiftMonth(date: string, offset: number) {
  const { year, month, day } = getDateParts(date);
  const next = new Date(year, month - 1 + offset, 1);
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
  return toDateString(next.getFullYear(), next.getMonth() + 1, Math.min(day, maxDay));
}

function TimelineMeal({ meal, onClick }: { meal: Meal; onClick: () => void }) {
  const nutrition = getMealNutrition(meal);
  const hasPhoto = Boolean(meal.imageUrl || meal.imageKey);
  const fallback = getFoodVisualFallback({ description: meal.title });
  return (
    <View className="meal-records-page__timeline-item" onClick={onClick}>
      <View className="meal-records-page__timeline-marker" />
      <View className="meal-records-page__meal-card">
        <View
          className={`meal-records-page__meal-visual meal-records-page__meal-visual--${
            hasPhoto ? meal.imageKey ?? "photo" : fallback.tone
          }`}
        >
          {hasPhoto ? (
            <Image
              className="meal-records-page__meal-image"
              src={meal.imageUrl || imageByKey[meal.imageKey!]}
              mode="aspectFill"
            />
          ) : (
            <NordicIcon name={fallback.icon} size={22} ariaLabel={meal.title} />
          )}
        </View>
        <View className="meal-records-page__meal-copy">
          <View className="meal-records-page__meal-title-row">
            <Text className="meal-records-page__meal-title">{meal.title}</Text>
            {meal.favorite ? (
              <NordicIcon name="heart-filled" size={16} ariaLabel="已收藏" />
            ) : null}
          </View>
          <Text className="meal-records-page__meal-meta">
            {mealLabels[meal.mealType]} · {meal.time}
          </Text>
          <View className="meal-records-page__meal-tags">
            <Text>{nutrition.protein}g 蛋白质</Text>
            <Text>{nutrition.carbs}g 碳水</Text>
            <Text>{nutrition.fat}g 脂肪</Text>
          </View>
        </View>
        <Text className="meal-records-page__meal-kcal">
          {nutrition.calories}
          <Text> kcal</Text>
        </Text>
      </View>
    </View>
  );
}

export default function MealRecordsPage() {
  useAppShare();
  const store = useMealStore();
  const setTabBarVisible = useTabBarStore((state) => state.setVisible);
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [remoteSummary, setRemoteSummary] = useState<ProductDailySummary | null>(null);
  const [recordedDates, setRecordedDates] = useState<Set<string>>(new Set());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const today = getLocalDateString();
  const localSummary = store.getDailySummary();
  const summary = resolveHomeDailySummary(
    remoteSummary
      ? {
          ...remoteSummary.targets,
          consumed: remoteSummary.consumed,
          completion: remoteSummary.completion,
        }
      : null,
    localSummary,
  );
  const meals = store.filterMeals();
  const weekDays = useMemo(() => getWeekDays(store.selectedDate), [store.selectedDate]);
  const monthCells = useMemo(() => getMonthGrid(store.selectedDate), [store.selectedDate]);
  const selectedDateParts = getDateParts(store.selectedDate);
  const calorieProgress = clampProgress(summary.consumed.calories, summary.calories);
  const maxDate = getLocalDateString(7);
  const openDetail = (id: string) => Taro.navigateTo({ url: `/pages/meal-detail/index?id=${id}` });
  const addMeal = () => {
    setActiveKey("food-scanner");
    void Taro.navigateTo({ url: "/pages/food-scanner/index" });
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
  const changePeriod = (offset: number) => {
    const nextDate = monthExpanded
      ? shiftMonth(store.selectedDate, offset)
      : shiftDate(store.selectedDate, offset * 7);
    if (nextDate <= maxDate) store.setSelectedDate(nextDate);
  };

  useDidShow(() => {
    setRefreshVersion((version) => version + 1);
  });

  useEffect(() => {
    if (filterOpen) {
      setTabBarVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setTabBarVisible(true), bottomSheetExitDuration);
    return () => clearTimeout(timer);
  }, [filterOpen, setTabBarVisible]);

  useEffect(() => () => setTabBarVisible(true), [setTabBarVisible]);

  useEffect(() => {
    void getProductDailySummary(store.selectedDate)
      .then(async (dailySummary) => {
        setRemoteSummary(dailySummary);
        if (Array.isArray(dailySummary.meals)) {
          store.replaceRemoteMeals(dailySummary.meals.map(mapProductMeal), store.selectedDate);
          return;
        }
        const remoteMeals = await getProductMeals(store.selectedDate);
        store.replaceRemoteMeals(remoteMeals, store.selectedDate);
      })
      .catch(() => {
        setRemoteSummary(null);
        store.replaceRemoteMeals([], store.selectedDate);
        store.setErrorState("饮食记录同步失败，请稍后重试");
      });
  }, [refreshVersion, store.replaceRemoteMeals, store.selectedDate]);

  useEffect(() => {
    const searching = Boolean(store.searchKeyword.trim());
    const range = monthExpanded || searching
      ? getMonthRange(store.selectedDate)
      : { start: weekDays[0], end: weekDays[6] };
    let cancelled = false;
    void getProductMealsRange(range.start, range.end, { light: !searching })
      .then((remoteMeals) => {
        if (cancelled) return;
        setRecordedDates(new Set(remoteMeals.map((meal) => meal.date)));
        if (searching) {
          store.replaceRemoteMeals(remoteMeals, store.selectedDate);
        }
      })
      .catch(() => {
        if (!cancelled) setRecordedDates(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [monthExpanded, store.replaceRemoteMeals, store.searchKeyword, store.selectedDate, weekDays]);

  return (
    <PageLayout
      title="饮食记录"
      activeTab="meal-records"
      hideNavigation
      className="page-layout--meal-records"
    >
      <View className="meal-records-page">
        <View className="meal-records-page__toolbar">
          <SearchBar
            value={store.searchKeyword}
            placeholder="搜索餐次或食材"
            onInput={store.setSearchKeyword}
            onClear={() => store.setSearchKeyword("")}
            trailing={
              <View
                className={`meal-records-page__filter-trigger ${hasFilters ? "meal-records-page__filter-trigger--active" : ""}`}
                ariaLabel="筛选记录"
                onClick={() => setFilterOpen(true)}
              >
                <NordicIcon name="list-checks" size={16} ariaLabel="筛选" />
              </View>
            }
          />
        </View>

        <View className={`meal-records-page__calendar ${monthExpanded ? "meal-records-page__calendar--month" : ""}`}>
          <View className="meal-records-page__calendar-head">
            <View
              className="meal-records-page__calendar-button"
              onClick={() => changePeriod(-1)}
              ariaLabel={monthExpanded ? "上一月" : "上一周"}
            >
              <NordicIcon name="back" size={18} />
            </View>
            <View className="meal-records-page__calendar-title-row">
              <Text className="meal-records-page__calendar-title">
                {selectedDateParts.year} 年 {selectedDateParts.month} 月
              </Text>
              <View
                className={`meal-records-page__calendar-expand ${monthExpanded ? "meal-records-page__calendar-expand--open" : ""}`}
                ariaLabel={monthExpanded ? "收起月历" : "展开整月日历"}
                onClick={() => setMonthExpanded((current) => !current)}
              >
                <NordicIcon name="chevron-right" size={16} ariaLabel={monthExpanded ? "收起" : "展开"} />
              </View>
            </View>
            <View
              className="meal-records-page__calendar-button meal-records-page__calendar-button--next"
              onClick={() => changePeriod(1)}
              ariaLabel={monthExpanded ? "下一月" : "下一周"}
            >
              <NordicIcon name="back" size={18} />
            </View>
          </View>
          <View className="meal-records-page__week-labels">
            {weekLabels.map((label) => (
              <Text key={label}>{label}</Text>
            ))}
          </View>
          {monthExpanded ? (
            <View className="meal-records-page__month-grid">
              {monthCells.map((cell) => {
                const { day } = getDateParts(cell.date);
                const active = cell.date === store.selectedDate;
                const hasRecord = recordedDates.has(cell.date);
                return (
                  <View
                    key={cell.date}
                    className={[
                      "meal-records-page__day",
                      "meal-records-page__day--month",
                      active ? "meal-records-page__day--active" : "",
                      !cell.inMonth ? "meal-records-page__day--muted" : "",
                      hasRecord ? "meal-records-page__day--recorded" : "",
                    ].filter(Boolean).join(" ")}
                    ariaLabel={hasRecord ? `${day}日，有饮食记录` : `${day}日`}
                    onClick={() => {
                      if (cell.date <= maxDate) store.setSelectedDate(cell.date);
                    }}
                  >
                    <Text>{day}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <View className="meal-records-page__week-days">
              {weekDays.map((date) => {
                const { day } = getDateParts(date);
                const active = date === store.selectedDate;
                const hasRecord = recordedDates.has(date);
                return (
                  <View
                    key={date}
                    className={[
                      "meal-records-page__day",
                      active ? "meal-records-page__day--active" : "",
                      hasRecord ? "meal-records-page__day--recorded" : "",
                    ].filter(Boolean).join(" ")}
                    ariaLabel={hasRecord ? `${day}日，有饮食记录` : `${day}日`}
                    onClick={() => store.setSelectedDate(date)}
                  >
                    <Text>{day}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        <View
          className={`meal-records-page__summary ${
            calorieProgress.exceeded ? "meal-records-page__summary--exceeded" : ""
          }`}
        >
          <View className="meal-records-page__summary-head">
            <View>
              <Text className="meal-records-page__summary-label">当日汇总</Text>
              <Text className="meal-records-page__summary-kcal">
                {summary.consumed.calories}
                <Text> / {summary.calories} kcal</Text>
              </Text>
              <Text
                className={`meal-records-page__summary-status ${
                  calorieProgress.exceeded ? "meal-records-page__summary-status--exceeded" : ""
                }`}
              >
                {formatTargetStatus(calorieProgress, " kcal")}
              </Text>
            </View>
            <NordicIcon name="calendar-days" size={26} />
          </View>
          <View
            className={`meal-records-page__summary-track ${
              calorieProgress.exceeded ? "meal-records-page__summary-track--exceeded" : ""
            }`}
          >
            <AnimatedProgressBar
              className="animated-progress-bar meal-records-page__summary-fill"
              percent={calorieProgress.percent}
            />
          </View>
          <View className="meal-records-page__summary-macros">
            {(
              [
                { label: "蛋白质", value: summary.consumed.protein, icon: "protein" },
                { label: "碳水", value: summary.consumed.carbs, icon: "carbs" },
                { label: "脂肪", value: summary.consumed.fat, icon: "fat" },
              ] as Array<{ label: string; value: number; icon: NordicIconName }>
            ).map((macro) => (
              <View className="meal-records-page__summary-macro" key={macro.label}>
                <View className="meal-records-page__summary-macro-label">
                  <NordicIcon name={macro.icon} size={16} ariaLabel={macro.label} />
                  <Text>{macro.label}</Text>
                </View>
                <Text className="meal-records-page__summary-macro-value">{macro.value}g</Text>
              </View>
            ))}
          </View>
        </View>

        <Text className="meal-records-page__section-title">
          {store.searchKeyword.trim() ? "搜索结果" : "今日餐次"}
        </Text>
        {store.loadingState === "error" ? (
          <ErrorState
            title="无法读取云端餐次"
            description={store.errorState ?? "请稍后再试。"}
            onRetry={() => store.setSelectedDate(store.selectedDate)}
          />
        ) : meals.length === 0 ? (
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
            <Text className="records-filter-sheet__title">筛选记录</Text>
            <Text className="records-filter-sheet__lead">
              按餐次类型或收藏查看当天的饮食记录。
            </Text>
          </View>

          <View className="records-filter-sheet__section">
            <Text className="records-filter-sheet__section-label">筛选</Text>
            <View className="records-filter-sheet__chips">
              {mealTypeFilters.map((option) => (
                <View
                  className={`records-filter-sheet__chip ${store.mealTypeFilter === option.value ? "records-filter-sheet__chip--active" : ""}`}
                  key={option.value}
                  onClick={() => store.setMealTypeFilter(option.value)}
                >
                  <Text>{option.label}</Text>
                </View>
              ))}
            </View>
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
            <View className="records-filter-sheet__manual-icon">
              <NordicIcon name="circle-plus" size={18} ariaLabel="手动记录" />
            </View>
            <View className="records-filter-sheet__manual-copy">
              <Text className="records-filter-sheet__manual-title">手动记录一餐</Text>
              <Text className="records-filter-sheet__manual-meta">不方便拍照时，直接录入食材与份量</Text>
            </View>
            <NordicIcon name="chevron-right" size={16} ariaLabel="前往手动记录" />
          </View>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
