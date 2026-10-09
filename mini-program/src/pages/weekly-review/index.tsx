import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { Button, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { getProductWeeklyReview, type ProductWeeklyReview } from "../../api/insight-api";
import { getMilestoneJourney } from "../../api/milestone-api";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { Modal } from "../../components/modal";
import { getLocalDateString } from "../../features/onboarding/domain";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { navigateBackOrHome } from "../../utils/navigation";
import { formatWeeklyComparison } from "./comparison-copy";
import { WeeklyShare } from "./weekly-share";
import "./index.scss";

export default function WeeklyReviewPage() {
  useTranslation();
  const meals = useMealStore();
  const [review, setReview] = useState<ProductWeeklyReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [details, setDetails] = useState(false);
  const [selected, setSelected] = useState<ProductWeeklyReview["rhythm"][number] | null>(null);
  const [sharing, setSharing] = useState(false);
  const [streak, setStreak] = useState<number | null>(null);
  const date = getLocalDateString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);
    setReview(null);
    setStreak(null);
    void getMilestoneJourney()
      .then((journey) => {
        if (active) setStreak(journey.currentStreakDays);
      })
      .catch(() => {
        /* A missing journey must not hide the weekly report. */
      });
    void getProductWeeklyReview(date, { preferFast: true })
      .then((base) => {
        if (!active) return;
        setReview(base);
        setLoading(false);
        if (!base.insight.cached && base.recordedDays >= 3) {
          void getProductWeeklyReview(date)
            .then((full) => {
              if (active) setReview(full);
            })
            .catch(() => {
              /* Keep the independently loaded base review. */
            });
        }
      })
      .catch(() => {
        if (active) {
          setError(true);
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [date, retry, t("settings.language")]);
  const nutrients = details
    ? (["calories", "protein", "carbs", "fat"] as const)
    : (["calories", "protein"] as const);
  const labels = {
    calories: t("weekly.calories"),
    protein: t("weekly.protein"),
    carbs: t("weekly.carbs"),
    fat: t("weekly.fat"),
  };
  const comparisonCopy = {
    prefix: t("weekly.comparison.prefix"), recordedDays: t("weekly.comparison.recordedDays"),
    recordedMeals: t("weekly.comparison.recordedMeals"), more: t("weekly.comparison.more"),
    fewer: t("weekly.comparison.fewer"), same: t("weekly.comparison.same"),
    dayUnit: t("weekly.comparison.dayUnit"), mealUnit: t("weekly.comparison.mealUnit"),
    colon: t("weekly.comparison.colon"), separator: t("weekly.comparison.separator"),
  };
  const openRecords = () => {
    if (!selected) return;
    meals.setSelectedDate(selected.date);
    setSelected(null);
    void Taro.switchTab({ url: "/pages/meal-records/index" });
  };
  return (
    <PageLayout
      title={t("weekly.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => navigateBackOrHome("/pages/profile/index")}
      className="page-layout--weekly-v2"
      scrollLocked={Boolean(selected) || sharing}
      overlay={
        sharing && review ? (
          <WeeklyShare
            review={review}
            streak={streak}
            onClose={() => setSharing(false)}
          />
        ) : undefined
      }
    >
      <View className="weekly-v2">
        {loading && <Text>{t("weekly.loading")}</Text>}
        {error && (
          <View className="weekly-v2__card">
            <Text>{t("weekly.loadFailed")}</Text>
            <Button onClick={() => setRetry(retry + 1)}>{t("common.retry")}</Button>
          </View>
        )}
        {review && (
          <>
            <View className="weekly-v2__hero">
              <Text className="weekly-v2__eyebrow">WEEKLY RHYTHM</Text>
              <View className="weekly-v2__score-row">
                <Text className="weekly-v2__score">{review.score}</Text>
                <Text className="weekly-v2__score-caption">{t("weekly.scoreCaption")}</Text>
              </View>
              <Text className="weekly-v2__dates">
                {review.startDate} — {review.rhythm.at(-1)?.date}
              </Text>
              <View className="weekly-v2__stats">
                <View>
                  <Text>{t("weekly.recorded")}</Text>
                  <Text className="weekly-v2__value">{t("weekly.daysOutOfSeven", { days: review.recordedDays })}</Text>
                </View>
                <View>
                  <Text>{t("weekly.mealsTotal")}</Text>
                  <Text className="weekly-v2__value">{t("weekly.mealsCount", { count: review.recordedMeals })}</Text>
                </View>
                <View>
                  <Text>{t("weekly.streak")}</Text>
                  <Text className="weekly-v2__value">{t("weekly.streakDays", { days: streak ?? "—" })}</Text>
                </View>
              </View>
              {review.comparison && (
                <Text className="weekly-v2__dates">
                  {formatWeeklyComparison(review.comparison, comparisonCopy)}
                </Text>
              )}
            </View>
            <View className="weekly-v2__card">
              <View className="weekly-v2__heading">
                <NordicIcon name="sparkles" size={20} />
                <Text>{t("weekly.nutrition")}</Text>
              </View>
              {nutrients.map((key) => {
                const percent = review.averageCompletion?.[key];
                return (
                  <View className="weekly-v2__nutrient" key={key}>
                    <View className="weekly-v2__row">
                      <Text>{labels[key]}</Text>
                      <Text>{percent == null ? "—" : `${percent}%`}</Text>
                    </View>
                    <View className="weekly-v2__track">
                      <View
                        style={{ width: `${percent ?? 0}%` }}
                        className={
                          key === "protein"
                            ? "weekly-v2__fill weekly-v2__fill--protein"
                            : "weekly-v2__fill"
                        }
                      />
                    </View>
                  </View>
                );
              })}
              <Button className="weekly-v2__link" onClick={() => setDetails(!details)}>
                {details ? t("common.collapse") : t("common.details")}
              </Button>
              <Text className="weekly-v2__muted">
                {t("weekly.nutritionNote")}
                {review.recordedDays < 3 ? t("weekly.insufficientRecords") : t("weekly.missingNotZero")}
              </Text>
            </View>
            <View className="weekly-v2__card">
              <View className="weekly-v2__heading">
                <NordicIcon name="nova" size={20} />
                <Text>{t("weekly.observations")}</Text>
              </View>
              {[
                [t("weekly.good"), review.insight.strengths[0] || t("weekly.goodFallback")],
                [t("weekly.attention"), review.insight.summary],
                [t("weekly.nextStep"), review.insight.nextSteps[0] || t("weekly.nextStepFallback")],
              ].map(([title, copy]) => (
                <View className="weekly-v2__observation" key={title}>
                  <Text className="weekly-v2__label">{title}</Text>
                  <Text className="weekly-v2__copy">{copy}</Text>
                </View>
              ))}
            </View>
            <View className="weekly-v2__card">
              <View className="weekly-v2__heading">
                <NordicIcon name="calendar-days" size={20} />
                <Text>{t("weekly.rhythm")}</Text>
              </View>
              <View className="weekly-v2__week">
                {review.rhythm.map((day, index) => {
                  const future = day.future ?? day.date > date;
                  return (
                    <Button
                      key={day.date}
                      disabled={future}
                      className={`weekly-v2__day${day.recorded ? " weekly-v2__day--recorded" : ""}`}
                      onClick={() => setSelected(day)}
                      ariaLabel={`${day.date} ${future ? t("weekly.future") : day.recorded ? t("weekly.recorded") : t("weekly.notRecorded")}`}
                    >
                      <Text>{t(`weekly.weekdays.${index}`)}</Text>
                      <View className="weekly-v2__dot" />
                      <Text>{future ? t("weekly.future") : day.recorded ? t("weekly.recorded") : t("weekly.notRecorded")}</Text>
                    </Button>
                  );
                })}
              </View>
            </View>
            <View className="weekly-v2__goal">
              <Text className="weekly-v2__heading">{t("weekly.goal")}</Text>
              <Text>{review.insight.nextSteps[0] || t("weekly.nextStepFallback")}</Text>
              <Text className="weekly-v2__muted">{t("weekly.goalHint")}</Text>
            </View>
            <Button className="weekly-v2__primary" onClick={() => setSharing(true)}>
              {t("weekly.share")}</Button>
            <Button
              className="weekly-v2__link"
              onClick={() => Taro.navigateTo({ url: "/pages/milestone-journey/index" })}
            >
              {t("weekly.journey")} →
            </Button>
          </>
        )}
      </View>
      <Modal
        open={Boolean(selected)}
        lockScroll
        onBackdropClick={() => setSelected(null)}
      >
        <View className="confirm-dialog weekly-review-summary__content">
          <Text className="confirm-dialog__title">{t("weekly.daySummary", { date: selected?.date })}</Text>
          <Text className="confirm-dialog__description">
            {selected?.recorded
              ? t("weekly.mealsLogged", { count: selected.mealCount ?? "—" })
              : t("weekly.noRecords")}
          </Text>
          {selected?.recorded && selected.consumed && (
            <Text className="confirm-dialog__description">
              {t("weekly.dayNutrition", { calories: Math.round(selected.consumed.calories), protein: Math.round(selected.consumed.protein) })}
            </Text>
          )}
          <View className="weekly-review-summary__actions">
            <AppButton size="medium" onClick={openRecords}>
              {t("weekly.viewRecords")}</AppButton>
            <AppButton variant="ghost" size="small" onClick={() => setSelected(null)}>
              {t("common.close")}</AppButton>
          </View>
        </View>
      </Modal>
    </PageLayout>
  );
}
