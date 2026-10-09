import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatedProgressBar } from "../../components/animated-progress-bar";
import { AppButton } from "../../components/app-button";
import { BottomSheet, bottomSheetExitDuration } from "../../components/bottom-sheet";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { EmptyState } from "../../components/empty-state";
import { ErrorState } from "../../components/error-state";
import { FirstRunTip } from "../../components/first-run-tip";
import { SearchBar } from "../../components/search-bar";
import { getFoodVisualFallback } from "../../features/food-catalog/food-visuals";
import {
  hasSeenFirstRunTip,
  markFirstRunTipSeen,
  retireFirstRunTipsIfRecordedMeals,
} from "../../features/first-run-tips/first-run-tips";
import {
  clampProgress,
  getMealNutrition,
  shiftDate,
  type Meal,
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
import { refreshAndroidSmartReminders } from "../../features/smart-reminders/coordinator";
import { pendingReminderStorage } from "../../features/smart-reminders/pending-reminder";

const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };
const isAndroidApp = process.env.TARO_APP_PLATFORM === "android";
const weekLabels = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
const mealTypeFilters: MealTypeFilter[] = ["all", "breakfast", "lunch", "dinner", "snack", "favorite"];

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
  useTranslation();
  const nutrition = getMealNutrition(meal);
  const hasPhoto = Boolean(meal.imageUrl || meal.imageKey);
  const fallback = getFoodVisualFallback({ description: meal.title });
  return (
    <View className="meal-records-page__timeline-item" onClick={onClick}>
      <View className="meal-records-page__timeline-marker" />
      <View className="meal-records-page__meal-card">
        <View
          className={`meal-records-page__meal-visual meal-records-page__meal-visual--${
            hasPhoto ? (meal.imageKey ?? "photo") : fallback.tone
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
            {meal.favorite ? <NordicIcon name="heart-filled" size={16} ariaLabel={t("records.favorite")} /> : null}
          </View>
          <Text className="meal-records-page__meal-meta">
            {t(`meals.${meal.mealType}`)} · {meal.time}
          </Text>
          <View className="meal-records-page__meal-tags">
            <Text>{nutrition.protein}g {t("nutrition.protein")}</Text>
            <Text>{nutrition.carbs}g {t("nutrition.carbs")}</Text>
            <Text>{nutrition.fat}g {t("nutrition.fat")}</Text>
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
  useTranslation();
  useAppShare();
  const store = useMealStore();
  const setTabBarVisible = useTabBarStore((state) => state.setVisible);
  const setActiveKey = useTabBarStore((state) => state.setActiveKey);
  const [filterOpen, setFilterOpen] = useState(false);
  const [monthExpanded, setMonthExpanded] = useState(false);
  const [visibleMonthDate, setVisibleMonthDate] = useState(store.selectedDate);
  const [remoteSummary, setRemoteSummary] = useState<ProductDailySummary | null>(null);
  const [recordedDates, setRecordedDates] = useState<Set<string>>(new Set());
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const pullRefreshPending = useRef(false);
  const [showRecordsTip, setShowRecordsTip] = useState(() => {
    if (
      retireFirstRunTipsIfRecordedMeals(
        useMealStore.getState().meals,
        useMealStore.getState().dataSource,
      )
    ) {
      return false;
    }
    return !hasSeenFirstRunTip("meal-records-review");
  });
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
  const monthCells = useMemo(() => getMonthGrid(visibleMonthDate), [visibleMonthDate]);
  const visibleMonthParts = getDateParts(visibleMonthDate);
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
    if (monthExpanded) {
      setVisibleMonthDate(shiftMonth(visibleMonthDate, offset));
      return;
    }
    const nextDate = shiftDate(store.selectedDate, offset * 7);
    if (nextDate <= maxDate) { setVisibleMonthDate(nextDate); store.setSelectedDate(nextDate); }
  };

  usePullDownRefresh(() => {
    pullRefreshPending.current = true;
    setRefreshing(true);
    setRefreshVersion((version) => version + 1);
  });

  useDidShow(() => {
    setRefreshVersion((version) => version + 1);
    const pendingReminder = pendingReminderStorage.consume();
    if (pendingReminder) {
      void Taro.navigateTo({
        url: `/pages/manual-meal/index?mealType=${pendingReminder.mealType}&reminder=1`,
      });
    }
    if (retireFirstRunTipsIfRecordedMeals(store.meals, store.dataSource)) {
      setShowRecordsTip(false);
    } else if (hasSeenFirstRunTip("meal-records-review")) {
      setShowRecordsTip(false);
    } else {
      setShowRecordsTip(true);
    }
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
    const selectedDate = store.selectedDate;
    let cancelled = false;
    const request = getProductDailySummary(selectedDate)
      .then(async (dailySummary) => {
        if (cancelled) return;
        setRemoteSummary(dailySummary);
        store.setDailyTargets(dailySummary.targets);
        if (Array.isArray(dailySummary.meals)) {
          store.replaceRemoteMeals(dailySummary.meals.map(mapProductMeal), selectedDate);
          return;
        }
        const remoteMeals = await getProductMeals(selectedDate);
        if (cancelled) return;
        store.replaceRemoteMeals(remoteMeals, selectedDate);
        void refreshAndroidSmartReminders();
      })
      .catch(() => {
        if (cancelled) return;
        setRemoteSummary(null);
        store.replaceRemoteMeals([], selectedDate);
        store.setErrorState(t("records.syncFailed"));
      });
    void request.finally(() => {
      if (!cancelled && pullRefreshPending.current) {
        pullRefreshPending.current = false;
        setRefreshing(false);
        Taro.stopPullDownRefresh();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion, store.replaceRemoteMeals, store.selectedDate]);

  useEffect(() => {
    const searching = Boolean(store.searchKeyword.trim());
    const range =
      monthExpanded || searching
        ? getMonthRange(visibleMonthDate)
        : { start: weekDays[0], end: weekDays[6] };
    let cancelled = false;
    void getProductMealsRange(range.start, range.end, { light: !searching })
      .then((remoteMeals) => {
        if (cancelled) return;
        setRecordedDates(new Set(remoteMeals.map((meal) => meal.date)));
        if (searching) {
          store.replaceRemoteMeals(remoteMeals, store.selectedDate);
          void refreshAndroidSmartReminders();
        }
      })
      .catch(() => {
        if (!cancelled) setRecordedDates(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [monthExpanded, store.replaceRemoteMeals, store.searchKeyword, store.selectedDate, visibleMonthDate, weekDays]);

  return (
    <PageLayout
      title={t("records.title")}
      activeTab="meal-records"
      topBarAction={t("profile.favorites")}
      onTopBarAction={() => { void Taro.navigateTo({ url: "/pages/frequent-meals/index" }); }}
      hideNavigation
      refreshing={refreshing}
      className={`page-layout--meal-records${isAndroidApp ? " page-layout--meal-records-android" : ""}`}
    >
      <View className="meal-records-page">
        {showRecordsTip ? (
          <FirstRunTip
            tipId="meal-records-review"
            step="3/3"
            title={t("records.firstRunTitle")}
            body={t("records.firstRunBody")}
            actionLabel={t("records.add")}
            onAction={() => {
              void Taro.navigateTo({ url: "/pages/manual-meal/index" });
            }}
            onClose={() => {
              markFirstRunTipSeen("meal-records-review");
              setShowRecordsTip(false);
            }}
          />
        ) : null}
        <View className="meal-records-page__toolbar">
          <SearchBar
            value={store.searchKeyword}
            placeholder={t("records.searchPlaceholder")}
            onInput={store.setSearchKeyword}
            onClear={() => store.setSearchKeyword("")}
            trailing={
              <View
                className={`meal-records-page__filter-trigger ${hasFilters ? "meal-records-page__filter-trigger--active" : ""}`}
                ariaLabel={t("records.filter")}
                onClick={() => setFilterOpen(true)}
              >
                <NordicIcon name="list-checks" size={16} ariaLabel={t("records.filter")} />
              </View>
            }
          />
        </View>

        <View
          className={`meal-records-page__calendar ${monthExpanded ? "meal-records-page__calendar--month" : ""}`}
        >
          <View className="meal-records-page__calendar-head">
            <View
              className="meal-records-page__calendar-button"
              onClick={() => changePeriod(-1)}
              ariaLabel={monthExpanded ? t("records.previousMonth") : t("records.previousWeek")}
            >
              <NordicIcon name="back" size={18} />
            </View>
            <View className="meal-records-page__calendar-title-row">
              <Text className="meal-records-page__calendar-title">
                {t("records.yearMonth", { year: visibleMonthParts.year, month: visibleMonthParts.month })}
              </Text>
              <View
                className={`meal-records-page__calendar-expand ${monthExpanded ? "meal-records-page__calendar-expand--open" : ""}`}
                ariaLabel={monthExpanded ? t("records.collapseCalendar") : t("records.expandCalendar")}
                onClick={() => setMonthExpanded((current) => !current)}
              >
                <NordicIcon
                  name="chevron-right"
                  size={16}
                  ariaLabel={monthExpanded ? t("records.collapse") : t("records.expand")}
                />
              </View>
            </View>
            <View
              className="meal-records-page__calendar-button meal-records-page__calendar-button--next"
              onClick={() => changePeriod(1)}
              ariaLabel={monthExpanded ? t("records.nextMonth") : t("records.nextWeek")}
            >
              <NordicIcon name="back" size={18} />
            </View>
          </View>
          <View className="meal-records-page__week-labels">
            {weekLabels.map((label) => (
              <Text key={label}>{t(`records.weekdays.${label}`)}</Text>
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
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    ariaLabel={hasRecord ? t("records.dateWithRecord", { day }) : t("records.date", { day })}
                    onClick={() => {
                      if (cell.date <= maxDate) {
                        setVisibleMonthDate(cell.date);
                        store.setSelectedDate(cell.date);
                      }
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
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    ariaLabel={hasRecord ? t("records.dateWithRecord", { day }) : t("records.date", { day })}
                    onClick={() => { setVisibleMonthDate(date); store.setSelectedDate(date); }}
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
              <Text className="meal-records-page__summary-label">{t("records.dailySummary")}</Text>
              <Text className="meal-records-page__summary-kcal">
                {summary.consumed.calories}
                <Text> / {summary.calories} kcal</Text>
              </Text>
              <Text
                className={`meal-records-page__summary-status ${
                  calorieProgress.exceeded ? "meal-records-page__summary-status--exceeded" : ""
                }`}
              >
                {calorieProgress.exceeded
                  ? t("records.overTarget", { amount: calorieProgress.excess })
                  : t("records.remaining", { amount: Math.max(0, calorieProgress.remaining) })}
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
                { label: t("nutrition.protein"), value: summary.consumed.protein, icon: "protein" },
                { label: t("nutrition.carbs"), value: summary.consumed.carbs, icon: "carbs" },
                { label: t("nutrition.fat"), value: summary.consumed.fat, icon: "fat" },
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
          {store.searchKeyword.trim() ? t("records.searchResults") : t("records.todayMeals")}
        </Text>
        {store.loadingState === "error" ? (
          <ErrorState
            title={t("records.loadFailed")}
            description={store.errorState ?? t("common.requestFailed")}
            onRetry={() => store.setSelectedDate(store.selectedDate)}
          />
        ) : meals.length === 0 ? (
          <EmptyState
            title={
              hasFilters
                ? t("records.noMatches")
                : store.selectedDate > today
                  ? t("records.futureEmpty")
                  : t("records.dayEmpty")
            }
            description={hasFilters ? t("records.tryOtherFilter") : null}
            showMark={hasFilters}
            actionLabel={hasFilters ? t("records.clearFilters") : t("records.addMeal")}
            onAction={hasFilters ? clearFilters : addMeal}
          />
        ) : (
          <View className="meal-records-page__timeline">
            {meals.map((meal) => (
              <TimelineMeal key={meal.id} meal={meal} onClick={() => openDetail(meal.id)} />
            ))}
          </View>
        )}
        <View className="meal-records-page__fab" onClick={addMeal} ariaLabel={t("records.addMeal")}>
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
            <Text className="records-filter-sheet__title">{t("records.filter")}</Text>
            <Text className="records-filter-sheet__lead">{t("records.filterHint")}</Text>
          </View>

          <View className="records-filter-sheet__section">
            <Text className="records-filter-sheet__section-label">{t("records.filterSection")}</Text>
            <View className="records-filter-sheet__chips">
              {mealTypeFilters.map((option) => (
                <View
                  className={`records-filter-sheet__chip ${store.mealTypeFilter === option ? "records-filter-sheet__chip--active" : ""}`}
                  key={option}
                  onClick={() => store.setMealTypeFilter(option)}
                >
                  <Text>{t(`meals.${option}`)}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className="records-filter-sheet__actions">
            <AppButton variant="outline" size="medium" onClick={clearFilters}>
              {t("records.clearFilters")}
            </AppButton>
            <AppButton size="medium" onClick={() => setFilterOpen(false)}>
              {t("records.done")}
            </AppButton>
          </View>

          <View className="records-filter-sheet__manual" onClick={openManualMeal}>
            <View className="records-filter-sheet__manual-icon">
              <NordicIcon name="circle-plus" size={18} ariaLabel={t("records.manualLog")} />
            </View>
            <View className="records-filter-sheet__manual-copy">
              <Text className="records-filter-sheet__manual-title">{t("records.manualMeal")}</Text>
              <Text className="records-filter-sheet__manual-meta">
                {t("records.manualHint")}
              </Text>
            </View>
            <NordicIcon name="chevron-right" size={16} ariaLabel={t("records.manualLog")} />
          </View>
        </View>
      </BottomSheet>
    </PageLayout>
  );
}
