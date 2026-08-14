import { Text, View } from "@tarojs/components";
import {
  clampProgress,
  formatTargetStatus,
  type DailySummary,
} from "../../features/meals/domain";
import { useAnimatedProgress } from "../../hooks/useAnimatedProgress";
import { AnimatedProgressBar } from "../animated-progress-bar";
import { AppCard } from "../app-card";
import { MacroProgress } from "../macro-progress";

const macroRows: Array<{
  key: "protein" | "carbs" | "fat";
  label: string;
  tone: "protein" | "carbs" | "fat";
}> = [
  { key: "protein", label: "蛋白质", tone: "protein" },
  { key: "carbs", label: "碳水", tone: "carbs" },
  { key: "fat", label: "脂肪", tone: "fat" },
];
export function DailyNutritionSummary({
  summary,
  dashboard = false,
}: {
  summary: DailySummary;
  dashboard?: boolean;
}) {
  const calorieProgress = clampProgress(summary.consumed.calories, summary.calories);

  if (dashboard) {
    return <DailySummaryDashboard summary={summary} calorieProgress={calorieProgress} />;
  }

  return (
    <AppCard tone="beige" className="daily-summary">
      <View className="daily-summary__head">
        <View>
          <Text className="daily-summary__label">今日能量</Text>
          <Text className="daily-summary__value">
            {summary.consumed.calories}
            <Text> / {summary.calories} kcal</Text>
          </Text>
        </View>
        <Text
          className={`daily-summary__status ${calorieProgress.exceeded ? "daily-summary__status--exceeded" : ""}`}
        >
          {formatTargetStatus(calorieProgress, " kcal")}
        </Text>
      </View>
      <MacroProgress
        label="热量完成"
        value={summary.consumed.calories}
        target={summary.calories}
        unit=" kcal"
      />
      <View className="daily-summary__macros">
        {macroRows.map(({ key, label, tone }) => {
          const progress = clampProgress(summary.consumed[key], summary[key]);
          return (
            <View className="daily-summary__macro" key={key}>
              <Text className="daily-summary__macro-label">{label}</Text>
              <Text className="daily-summary__macro-value">
                {summary.consumed[key]}/{summary[key]}g
              </Text>
              <Text
                className={
                  progress.exceeded ? "daily-summary__macro-over" : "daily-summary__macro-remaining"
                }
              >
                {formatTargetStatus(progress, "g", { short: true })}
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

function DailySummaryDashboard({
  summary,
  calorieProgress,
}: {
  summary: DailySummary;
  calorieProgress: ReturnType<typeof clampProgress>;
}) {
  const ringAmount = calorieProgress.exceeded
    ? calorieProgress.excess
    : Math.max(0, calorieProgress.remaining);
  const ringProgress = useAnimatedProgress(calorieProgress.percent);
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
            background: `conic-gradient(from -90deg, ${calorieProgress.exceeded ? "#ba1a1a" : "#153f2b"} 0 ${ringProgress}%, ${calorieProgress.exceeded ? "rgba(186, 26, 26, 0.14)" : "rgba(21, 63, 43, 0.14)"} ${ringProgress}% 100%)`,
          }}
        >
          <View className="daily-summary__dashboard-ring-copy">
            <Text className="daily-summary__dashboard-ring-value">{ringAmount}</Text>
            <Text className="daily-summary__dashboard-ring-label">
              {calorieProgress.exceeded ? "已超" : "剩余"}
            </Text>
          </View>
        </View>
        <View className="daily-summary__dashboard-macros">
          {macroRows.map(({ key, label, tone }) => {
            const progress = clampProgress(summary.consumed[key], summary[key]);
            return (
              <View className="daily-summary__dashboard-macro" key={key}>
                <View className="daily-summary__dashboard-macro-head">
                  <Text>{label}</Text>
                  <Text className={progress.exceeded ? "daily-summary__dashboard-macro-over" : ""}>
                    {summary.consumed[key]}/{summary[key]}g
                    {progress.exceeded ? ` · ${formatTargetStatus(progress, "g", { short: true })}` : ""}
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
          今日已摄入 {summary.consumed.calories} / {summary.calories} kcal
        </Text>
        <Text
          className={
            calorieProgress.exceeded ? "daily-summary__dashboard-foot-over" : undefined
          }
        >
          {formatTargetStatus(calorieProgress, " kcal")}
        </Text>
      </View>
    </AppCard>
  );
}
