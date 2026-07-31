import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { ErrorState } from "../../components/error-state";
import { MacroProgress } from "../../components/macro-progress";
import { PageLayout } from "../../layouts/page-layout";
import { createMealFromAnalysis } from "../../features/scanner/domain";
import { createProductMeal, getProductMeals, updateProductMeal } from "../../api/meal-data-api";
import { toProductMealInput } from "../../features/meals/product-meal-input";
import { getLocalDateString } from "../../features/onboarding/domain";
import { useMealStore } from "../../stores/meal-store";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";

const nowTime = () => {
  const date = new Date();
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const portionPresets = [25, 50, 75, 100, 125, 150, 175, 200];

export default function PortionAdjustmentPage() {
  const portion = usePortionDraftStore();
  const meals = useMealStore();
  const feedback = useFeedbackStore();
  const [isSaving, setIsSaving] = useState(false);
  const adjusted = portion.getAdjusted();
  if (!portion.meal || !adjusted)
    return (
      <PageLayout
        title="调整份量"
        subtitle="没有可调整的本地分析结果。"
        eyebrow="确认餐食"
        showTabs={false}
        leading="‹"
        onLeadingClick={() => navigateBackOrHome("/pages/analysis-result/index")}
      >
        <ErrorState title="份量草稿不存在" description="请从分析结果进入份量调整。" />
      </PageLayout>
    );
  const percentage = Math.round(portion.multiplier * 100);
  const trackProgress = ((percentage - 25) / 175) * 100;
  const adjustmentCopy =
    percentage === 100
      ? "与原始识别份量一致"
      : percentage > 100
        ? `比原始份量增加 ${percentage - 100}%`
        : `比原始份量减少 ${100 - percentage}%`;
  const canDecrease = portion.multiplier > 0.25;
  const canIncrease = portion.multiplier < 2;
  const save = async () => {
    const editingId = portion.editingMealId;
    const draftMeal = portion.meal;
    const multiplier = portion.multiplier;
    if (!draftMeal || !adjusted) return;
    setIsSaving(true);
    try {
      let id = editingId;
      if (editingId) {
        const current = meals.getMealById(editingId);
        if (!current) throw new Error("Meal not found");
        const saved = await updateProductMeal(editingId, {
          items: toProductMealInput({ ...current, items: adjusted.items }).items,
        });
        if (!saved) throw new Error("Meal not found");
        id = saved.id;
        feedback.show({ message: "份量已更新并同步", tone: "success" });
      } else {
        const localMeal = createMealFromAnalysis(
          draftMeal,
          multiplier,
          getLocalDateString(),
          nowTime(),
        );
        id = (await createProductMeal(toProductMealInput(localMeal))).id;
        feedback.show({ message: "已保存并同步到饮食记录", tone: "success" });
      }
      const mealDate = getLocalDateString();
      meals.replaceRemoteMeals(await getProductMeals(mealDate), mealDate);
      setTimeout(() => {
        void import("../../features/coach/refresh-achievements")
          .then(({ refreshProductAchievements }) => refreshProductAchievements(mealDate))
          .catch(() => undefined);
      }, 2800);
      // Navigate before clearing the draft — resetting first re-renders this page as
      // "份量草稿不存在", and a failed/timed-out redirect leaves the user stuck there.
      await Taro.redirectTo({ url: `/pages/meal-detail/index?id=${id}` });
      portion.reset();
    } catch {
      feedback.show({ message: "保存调整失败，请稍后重试", tone: "error" });
    } finally {
      setIsSaving(false);
    }
  };
  return (
    <PageLayout
      title="调整份量"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--portion-adjustment"
    >
      <View className="portion-adjustment-page">
        <AppCard tone="beige" className="portion-summary">
          <View className="portion-summary__meal">
            <Text className="portion-summary__label">当前餐食</Text>
            <Text className="portion-summary__meal-title">{adjusted.title}</Text>
          </View>
          <View className="portion-summary__energy">
            <Text className="portion-summary__label">调整后热量</Text>
            <Text className="portion-summary__value">{adjusted.calories} kcal</Text>
          </View>
        </AppCard>
        <AppCard className="content-stack content-stack--compact">
          <View className="portion-stepper">
            <View>
              <Text className="section-title__title">份量比例</Text>
              <Text className="portion-stepper__hint">按 25% 微调，本地营养将即时同步</Text>
            </View>
            <Text className="portion-stepper__value">{percentage}%</Text>
          </View>
          <View className="portion-track" ariaLabel={`当前份量比例 ${percentage}%`}>
            <View className="portion-track__rail" />
            <View className="portion-track__fill" style={{ width: `${trackProgress}%` }} />
            <View className="portion-track__thumb" style={{ left: `${trackProgress}%` }} />
          </View>
          <View className="portion-control" ariaLabel="份量比例控制">
            <View
              ariaLabel="减少份量 25%"
              className={`portion-control__button ${canDecrease ? "" : "portion-control__button--disabled"}`}
              onClick={() => canDecrease && portion.adjustBy(-0.25)}
            >
              <Text>-</Text>
            </View>
            <View className="portion-control__value">
              <Text className="portion-control__copy">{adjustmentCopy}</Text>
            </View>
            <View
              ariaLabel="增加份量 25%"
              className={`portion-control__button ${canIncrease ? "" : "portion-control__button--disabled"}`}
              onClick={() => canIncrease && portion.adjustBy(0.25)}
            >
              <Text>+</Text>
            </View>
          </View>
          <View className="portion-presets" ariaLabel="快速选择份量比例">
            {portionPresets.map((percent) => (
              <View
                key={percent}
                ariaLabel={`设为 ${percent}% 份量`}
                className={`portion-presets__item ${percent === percentage ? "portion-presets__item--active" : ""}`}
                onClick={() => portion.setMultiplier(percent / 100)}
              >
                <Text>{percent}%</Text>
              </View>
            ))}
          </View>
          <View
            ariaLabel="恢复原始份量"
            className={`portion-reset ${percentage === 100 ? "portion-reset--disabled" : ""}`}
            onClick={() => percentage !== 100 && portion.setMultiplier(1)}
          >
            <Text>恢复原始份量</Text>
          </View>
        </AppCard>
        <AppCard className="content-stack content-stack--compact">
          <Text className="section-title__title">实时营养</Text>
          <MacroProgress label="蛋白质" value={adjusted.protein} target={60} />
          <MacroProgress label="碳水" value={adjusted.carbs} target={90} tone="carbs" />
          <MacroProgress label="脂肪" value={adjusted.fat} target={25} tone="fat" />
          <Text className="portion-score">Meal Score · {adjusted.score}</Text>
        </AppCard>
        <AppButton size="large" loading={isSaving} onClick={() => void save()}>
          {portion.editingMealId ? "保存调整" : "保存本餐"} · {adjusted.calories} kcal
        </AppButton>
      </View>
    </PageLayout>
  );
}
