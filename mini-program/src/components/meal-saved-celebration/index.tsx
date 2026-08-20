import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import { getMealSavedCelebrationMotion, getMealSavedProgress } from "../../features/meals/meal-saved-celebration-motion";
import { useCountUp } from "../../hooks/useCountUp";
import { NordicIcon } from "../nordic-icon";

export interface MealSavedCelebrationProps {
  visible: boolean;
  kind?: "created" | "updated";
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  previousCalories: number;
  currentCalories: number;
  targetCalories: number;
  onViewMeal: () => void;
  onContinue: () => void;
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10);
}

export function MealSavedCelebration({
  visible,
  kind = "created",
  calories,
  protein,
  carbs,
  fat,
  previousCalories,
  currentCalories,
  targetCalories,
  onViewMeal,
  onContinue,
}: MealSavedCelebrationProps) {
  const motion = getMealSavedCelebrationMotion(kind);
  const { from, to } = getMealSavedProgress({
    beforeCalories: previousCalories,
    currentCalories,
    targetCalories,
  });
  const [progressScale, setProgressScale] = useState(from / 100);
  const [progressAnimating, setProgressAnimating] = useState(false);
  const [actionsReady, setActionsReady] = useState(false);
  const countDurationMs = 620;
  const calorieCount = useCountUp(calories, { enabled: visible, delayMs: motion.nutritionStartMs, durationMs: countDurationMs });
  const proteinCount = useCountUp(protein, { enabled: visible, delayMs: motion.nutritionStartMs + motion.nutritionStaggerMs, durationMs: countDurationMs });
  const carbsCount = useCountUp(carbs, { enabled: visible, delayMs: motion.nutritionStartMs + motion.nutritionStaggerMs * 2, durationMs: countDurationMs });
  const fatCount = useCountUp(fat, { enabled: visible, delayMs: motion.nutritionStartMs + motion.nutritionStaggerMs * 3, durationMs: countDurationMs });

  useEffect(() => {
    setProgressScale(from / 100);
    setProgressAnimating(false);
    setActionsReady(false);
    if (!visible) return;

    let progressTransitionTimer: ReturnType<typeof setTimeout> | undefined;
    const progressTimer = setTimeout(() => {
      setProgressAnimating(true);
      progressTransitionTimer = setTimeout(() => setProgressScale(to / 100), 32);
    }, motion.progressStartMs);
    const actionsTimer = setTimeout(() => setActionsReady(true), motion.totalDurationMs);
    return () => {
      clearTimeout(progressTimer);
      if (progressTransitionTimer) clearTimeout(progressTransitionTimer);
      clearTimeout(actionsTimer);
    };
  }, [from, motion, to, visible]);

  if (!visible) return null;

  const nutrients = [
    { icon: "flame" as const, label: `${formatAmount(calorieCount)} kcal`, tone: "primary" },
    { icon: "protein" as const, label: `蛋白质 ${formatAmount(proteinCount)}g`, tone: "secondary" },
    { icon: "carbs" as const, label: `碳水 ${formatAmount(carbsCount)}g`, tone: "secondary" },
    { icon: "fat" as const, label: `脂肪 ${formatAmount(fatCount)}g`, tone: "secondary" },
  ];

  return (
    <View className={`meal-saved-celebration meal-saved-celebration--${kind}`} ariaLabel="本餐已保存">
      <View className="meal-saved-celebration__backdrop" />
      <View className="meal-saved-celebration__card">
        <View className="meal-saved-celebration__success-icon">
          <View className="meal-saved-celebration__success-ring">
            <View className="meal-saved-celebration__ring-track" />
            <View className="meal-saved-celebration__check">
              <View className="meal-saved-celebration__check-mark" />
            </View>
          </View>
          <View className="meal-saved-celebration__particle meal-saved-celebration__particle--1" />
          <View className="meal-saved-celebration__particle meal-saved-celebration__particle--2" />
          <View className="meal-saved-celebration__particle meal-saved-celebration__particle--3" />
          <View className="meal-saved-celebration__particle meal-saved-celebration__particle--4" />
        </View>
        <Text className="meal-saved-celebration__title">{kind === "updated" ? "本餐已更新！" : "本餐已保存！"}</Text>
        <Text className="meal-saved-celebration__subtitle">
          {kind === "updated" ? "更新后的营养数据已同步到今日进度。" : "营养数据已同步到今日进度。"}
        </Text>
        <View className="meal-saved-celebration__chips">
          {nutrients.map((nutrient, index) => (
            <View className={`meal-saved-celebration__chip meal-saved-celebration__chip--${index + 1}`} key={nutrient.icon}>
              <NordicIcon name={nutrient.icon} size={16} ariaLabel="" />
              <Text>{nutrient.label}</Text>
            </View>
          ))}
        </View>
        <View className="meal-saved-celebration__progress">
          <View className="meal-saved-celebration__progress-head">
            <Text>今日进度</Text>
            <Text>{formatAmount(currentCalories)} / {formatAmount(targetCalories)} kcal</Text>
          </View>
          <View className="meal-saved-celebration__progress-track">
            <View
              className={`meal-saved-celebration__progress-fill ${progressAnimating ? "meal-saved-celebration__progress-fill--animating" : ""}`}
              style={{ transform: `scaleX(${progressScale})` }}
            />
          </View>
        </View>
        <View className="meal-saved-celebration__actions">
          <View className="meal-saved-celebration__view-meal" onClick={() => { if (actionsReady) onViewMeal(); }}>
            <Text>查看本餐</Text>
          </View>
          <View className="meal-saved-celebration__continue" onClick={() => { if (actionsReady) onContinue(); }}>
            <Text>继续记录</Text>
          </View>
        </View>
      </View>
    </View>
  );
}
