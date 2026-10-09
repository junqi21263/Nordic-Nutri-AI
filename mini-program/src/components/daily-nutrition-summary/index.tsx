import { Text, View } from "@tarojs/components";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  clampProgress,
  type DailySummary,
} from "../../features/meals/domain";
import { useAnimatedProgress } from "../../hooks/useAnimatedProgress";
import { AnimatedProgressBar } from "../animated-progress-bar";
import { AppCard } from "../app-card";
import { MacroProgress } from "../macro-progress";

const macroRows: Array<{ key: "protein" | "carbs" | "fat"; tone: "protein" | "carbs" | "fat" }> = [
  { key: "protein", tone: "protein" }, { key: "carbs", tone: "carbs" }, { key: "fat", tone: "fat" },
];
export function DailyNutritionSummary({
  summary,
  dashboard = false,
}: {
  summary: DailySummary;
  dashboard?: boolean;
}) {
  const { t } = useTranslation();
  const calorieProgress = clampProgress(summary.consumed.calories, summary.calories);

  if (dashboard) {
    return <DailySummaryDashboard summary={summary} calorieProgress={calorieProgress} />;
  }

  return (
    <AppCard tone="beige" className="daily-summary">
      <View className="daily-summary__head">
        <View>
          <Text className="daily-summary__label">{t("dailySummary.energy")}</Text>
          <Text className="daily-summary__value">
            {summary.consumed.calories}
            <Text> / {summary.calories} kcal</Text>
          </Text>
        </View>
        <Text
          className={`daily-summary__status ${calorieProgress.exceeded ? "daily-summary__status--exceeded" : ""}`}
        >
          {targetStatus(calorieProgress, " kcal", t)}
        </Text>
      </View>
      <MacroProgress
        label={t("dailySummary.calorieCompletion")}
        value={summary.consumed.calories}
        target={summary.calories}
        unit=" kcal"
      />
      <View className="daily-summary__macros">
        {macroRows.map(({ key, tone }) => {
          const progress = clampProgress(summary.consumed[key], summary[key]);
          return (
            <View className="daily-summary__macro" key={key}>
              <Text className="daily-summary__macro-label">{t(`nutrition.${key}`)}</Text>
              <Text className="daily-summary__macro-value">
                {summary.consumed[key]}/{summary[key]}g
              </Text>
              <Text
                className={
                  progress.exceeded ? "daily-summary__macro-over" : "daily-summary__macro-remaining"
                }
              >
                {targetStatus(progress, "g", t, true)}
              </Text>
              <MacroProgress
                label=""
                value={summary.consumed[key]}
                target={summary[key]}
                tone={tone}
              />
            </View>
          );
        })}
      </View>
    </AppCard>
  );
}

function targetStatus(progress: ReturnType<typeof clampProgress>, unit: string, t: TFunction, short = false) {
  const amount = progress.exceeded ? progress.excess : Math.max(0, progress.remaining);
  return t(progress.exceeded
    ? short ? "dailySummary.overShort" : "dailySummary.over"
    : short ? "dailySummary.remainingShort" : "dailySummary.remaining", { amount, unit });
}

function DailySummaryDashboard({
  summary,
  calorieProgress,
}: {
  summary: DailySummary;
  calorieProgress: ReturnType<typeof clampProgress>;
}) {
  const { t } = useTranslation();
  const ringAmount = calorieProgress.exceeded
    ? calorieProgress.excess
    : Math.max(0, calorieProgress.remaining);
  const ringProgress = useAnimatedProgress(
    calorieProgress.exceeded
      ? calorieProgress.percent
      : Math.max(0, 100 - calorieProgress.percent),
  );
  return (
    <AppCard
      tone="beige"
      className={`daily-summary daily-summary--dashboard ${
        calorieProgress.exceeded ? "daily-summary--dashboard-exceeded" : ""
      }`}
    >
      <View className="daily-summary__dashboard-main">
        <View
          className={`daily-summary__dashboard-ring ${
            calorieProgress.exceeded ? "daily-summary__dashboard-ring--exceeded" : ""
          }`}
          style={{
            background: `conic-gradient(from 0deg, ${calorieProgress.exceeded ? "#ba1a1a" : "#153f2b"} 0 ${ringProgress}%, ${calorieProgress.exceeded ? "rgba(186, 26, 26, 0.14)" : "rgba(21, 63, 43, 0.14)"} ${ringProgress}% 100%)`,
          }}
        >
          <View className="daily-summary__dashboard-ring-copy">
            <Text className="daily-summary__dashboard-ring-value">{ringAmount}</Text>
            <Text className="daily-summary__dashboard-ring-label">
              {t(calorieProgress.exceeded ? "dailySummary.overShort" : "dailySummary.remainingShort", { amount: ringAmount, unit: " kcal" })}
            </Text>
          </View>
        </View>
        <View className="daily-summary__dashboard-macros">
          {macroRows.map(({ key, tone }) => {
            const progress = clampProgress(summary.consumed[key], summary[key]);
            return (
              <View className="daily-summary__dashboard-macro" key={key}>
                <View className="daily-summary__dashboard-macro-head">
                  <Text>{t(`nutrition.${key}`)}</Text>
                  <Text className={progress.exceeded ? "daily-summary__dashboard-macro-over" : ""}>
                    {summary.consumed[key]}/{summary[key]}g
                    {progress.exceeded ? ` · ${targetStatus(progress, "g", t, true)}` : ""}
                  </Text>
                </View>
                <View
                  className={[
                    "daily-summary__dashboard-track",
                    `daily-summary__dashboard-track--${tone}`,
                    progress.exceeded ? "daily-summary__dashboard-track--exceeded" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  <AnimatedProgressBar
                    className="animated-progress-bar daily-summary__dashboard-fill"
                    percent={progress.percent}
                  />
                </View>
              </View>
            );
          })}
        </View>
      </View>
      <View className="daily-summary__dashboard-foot">
        <Text>
          {t("dailySummary.todayIntake", { consumed: summary.consumed.calories, target: summary.calories })}
        </Text>
        <Text
          className={
            calorieProgress.exceeded ? "daily-summary__dashboard-foot-over" : undefined
          }
        >
          {targetStatus(calorieProgress, " kcal", t)}
        </Text>
      </View>
    </AppCard>
  );
}
