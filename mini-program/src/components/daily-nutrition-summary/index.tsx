import { Text, View } from "@tarojs/components";
import { clampProgress, type DailySummary } from "../../features/meals/domain";
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
    const remainingCalories = Math.max(0, calorieProgress.remaining);
    return (
      <AppCard tone="beige" className="daily-summary daily-summary--dashboard">
        <View className="daily-summary__dashboard-main">
          <View
            className="daily-summary__dashboard-ring"
            style={{ "--progress": `${calorieProgress.percent}%` } as Record<string, string>}
          >
            <View className="daily-summary__dashboard-ring-copy">
              <Text className="daily-summary__dashboard-ring-value">{remainingCalories}</Text>
              <Text className="daily-summary__dashboard-ring-label">剩余</Text>
            </View>
          </View>
          <View className="daily-summary__dashboard-macros">
            {macroRows.map(({ key, label, tone }) => {
              const progress = clampProgress(summary.consumed[key], summary[key]);
              return (
                <View className="daily-summary__dashboard-macro" key={key}>
                  <View className="daily-summary__dashboard-macro-head">
                    <Text>{label}</Text>
                    <Text>{summary.consumed[key]}/{summary[key]}g</Text>
                  </View>
                  <View className={`daily-summary__dashboard-track daily-summary__dashboard-track--${tone}`}>
                    <View style={{ width: `${progress.percent}%` }} />
                  </View>
                </View>
              );
            })}
          </View>
        </View>
        <View className="daily-summary__dashboard-foot">
          <Text>今日已摄入 {summary.consumed.calories} / {summary.calories} kcal</Text>
          <Text>{calorieProgress.exceeded ? `超出 ${Math.abs(calorieProgress.remaining)} kcal` : `还可摄入 ${remainingCalories} kcal`}</Text>
        </View>
      </AppCard>
    );
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
          {calorieProgress.exceeded
            ? `超出 ${Math.abs(calorieProgress.remaining)} kcal`
            : `还可摄入 ${calorieProgress.remaining} kcal`}
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
                {progress.exceeded
                  ? `超 ${Math.abs(progress.remaining)}g`
                  : `余 ${progress.remaining}g`}
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
