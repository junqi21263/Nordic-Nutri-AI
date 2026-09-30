import { Text, View } from "@tarojs/components";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import Taro, { useRouter, useDidShow } from "@tarojs/taro";
import { getMealTemplates, saveMealTemplate } from "../../api/meal-template-api";
import { useEffect, useState } from "react";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { MealDetailHero } from "../../components/meal-detail-hero";
import { ErrorState } from "../../components/error-state";
import { MacroProgress } from "../../components/macro-progress";
import { NordicIcon } from "../../components/nordic-icon";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { Modal } from "../../components/modal";
import { getMealNutrition, getMealScore } from "../../features/meals/domain";
import {
  deleteProductMeal,
  getProductMeal,
  getProductMeals,
  isRemoteMealId,
  updateProductMeal,
} from "../../api/meal-data-api";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useMealSavedCelebrationStore } from "../../stores/meal-saved-celebration-store";
export default function MealDetailPage() {
  useTranslation();
  const router = useRouter();
  const store = useMealStore();
  const portion = usePortionDraftStore();
  const feedback = useFeedbackStore();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [detailModal, setDetailModal] = useState<"score" | "insight" | null>(null);
  const [remoteMeal, setRemoteMeal] = useState<ReturnType<typeof store.getMealById>>(undefined);
  const storedMeal = store.getMealById(router.params.id);
  const meal = remoteMeal ?? storedMeal;
  const [templateSaved, setTemplateSaved] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  useDidShow(() => {
    setTemplateSaved(false);
    void getMealTemplates().then((templates) => setTemplateSaved(templates.some((item) => item.sourceMealId === router.params.id))).catch(() => undefined);
  });
  useEffect(() => {
    if (!isRemoteMealId(router.params.id)) return;
    let cancelled = false;
    const refresh = () =>
      getProductMeal(router.params.id!)
        .then((result) => {
          if (cancelled || !result) return;
          setRemoteMeal(result);
          if (store.getMealById(result.id)) store.updateMeal(result.id, result);
          else store.addMeal(result);
          return result;
        })
        .catch(() => undefined);

    void refresh().then((result) => {
      if (cancelled || !result) return;
      const pending = !result.insight || result.insight.includes("正在整理");
      if (!pending) return;
      // Background insight generation may finish shortly after the fast response.
      setTimeout(() => {
        if (!cancelled) void refresh();
      }, 2500);
    });
    return () => {
      cancelled = true;
    };
  }, [router.params.id, store.addMeal, store.getMealById, store.updateMeal]);
  if (!meal)
    return (
      <PageLayout
        title={t("mealDetail.recordDetails")}
        subtitle={t("mealDetail.recordMissingSubtitle")}
        eyebrow={t("tabs.meal-records")}
        showTabs={false}
        leading="‹"
        onLeadingClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
      >
        <ErrorState title={t("mealDetail.recordMissing")} description={t("mealDetail.recordMissingDescription")} />
        <AppButton
          size="large"
          onClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
        >
          {t("mealDetail.backToRecords")}
        </AppButton>
      </PageLayout>
    );
  const nutrition = getMealNutrition(meal);
  const score = getMealScore(meal);
  const scoreDetail = {
    label: t(`mealDetail.scores.${score}.label`),
    summary: t(`mealDetail.scores.${score}.summary`),
    reasons: [t(`mealDetail.scores.${score}.reason1`), t(`mealDetail.scores.${score}.reason2`)],
  };
  const macros = [
    { label: t("nutrition.protein"), target: 60, tone: undefined, value: nutrition.protein },
    { label: t("nutrition.carbs"), target: 90, tone: "carbs" as const, value: nutrition.carbs },
    { label: t("nutrition.fat"), target: 25, tone: "fat" as const, value: nutrition.fat },
  ];
  const edit = () => {
    store.setEditingMealId(meal.id);
    portion.startMealEdit(meal);
    Taro.navigateTo({ url: `/pages/portion-adjustment/index?id=${meal.id}` });
  };
  const repeat = () => {
    portion.startMealRepeat(meal);
    Taro.navigateTo({ url: "/pages/portion-adjustment/index?mode=repeat" });
  };
  const handleTopBarBack = () => {
    if (router.params.from === "analysis") {
      void Taro.switchTab({ url: "/pages/meal-records/index" });
      return;
    }
    void Taro.navigateBack();
  };
  const remove = async () => {
    if (!isRemoteMealId(meal.id)) {
      store.deleteMeal(meal.id);
      feedback.show({ message: t("mealDetail.deleted"), tone: "success" });
      void Taro.switchTab({ url: "/pages/meal-records/index" });
      return;
    }
    try {
      const result = await deleteProductMeal(meal.id);
      if (!result.deleted) throw new Error("Meal not found");
      store.replaceRemoteMeals(await getProductMeals(meal.date), meal.date);
      feedback.show({ message: t("mealDetail.deletedSynced"), tone: "success" });
      Taro.switchTab({ url: "/pages/meal-records/index" });
    } catch {
      feedback.show({ message: t("mealDetail.deleteFailed"), tone: "error" });
    }
  };
  const toggleFavorite = async () => {
    const nextFavorite = !meal.favorite;
    if (!isRemoteMealId(meal.id)) {
      store.toggleFavorite(meal.id);
      feedback.show({
        message: t(nextFavorite ? "mealDetail.savedFavorite" : "mealDetail.removedFavorite"),
        tone: "success",
      });
      return;
    }
    try {
      const saved = await updateProductMeal(meal.id, { isFavorite: nextFavorite });
      if (!saved) throw new Error("Meal not found");
      // Detail UI prefers remoteMeal over the store — keep both in sync.
      setRemoteMeal(saved);
      if (store.getMealById(saved.id)) store.updateMeal(saved.id, saved);
      else store.addMeal(saved);
      // “收藏灵感” is calculated from the persisted favorite flag. Evaluate it
      // after the write so the server can return the pending unlock event.
      const { evaluateProductAchievements } = await import("../../features/coach/refresh-achievements");
      await evaluateProductAchievements(meal.date);
      feedback.show({
        message: t(nextFavorite ? "mealDetail.savedFavoriteHint" : "mealDetail.removedFavorite"),
        tone: "success",
      });
    } catch {
      feedback.show({ message: t("mealDetail.favoriteFailed"), tone: "error" });
    }
  };
  return (
    <PageLayout
      title={t("mealDetail.title")}
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={handleTopBarBack}
      className="page-layout--meal-detail"
    >
      <View className="meal-detail-page">
        <View className="meal-detail-page__heading">
          <Text className="meal-detail-page__meal-title">{meal.title}</Text>
          <Text className="meal-detail-page__meta">
            {meal.date} · {meal.time}
          </Text>
        </View>
        <MealDetailHero
          imageUrl={meal.imageUrl}
          nutrition={nutrition}
          score={score}
          scoreLabel={scoreDetail.label}
          scoreSummary={scoreDetail.summary}
          onScorePress={() => setDetailModal("score")}
        />
        <AppCard className="meal-detail-page__composition">
          <Text className="meal-detail-page__section-title">{t("mealDetail.composition")}</Text>
          {macros.map((macro) => (
            <MacroProgress
              key={macro.label}
              label={macro.label}
              value={macro.value}
              target={macro.target}
              tone={macro.tone}
            />
          ))}
        </AppCard>
        <View
          className="meal-detail-page__insight-card"
          ariaLabel={t("mealDetail.insightBasis")}
          onClick={() => setDetailModal("insight")}
        >
          <View className="meal-detail-page__insight-head">
            <View className="meal-detail-page__insight-orb">
              <NordicIcon name="nova" size={18} ariaLabel={t("mealDetail.insight")} />
            </View>
            <View className="meal-detail-page__insight-title">
              <Text>{t("mealDetail.insight")}</Text>
              <Text>{t("mealDetail.insightImpact")}</Text>
            </View>
            <NordicIcon name="chevron-right" size={18} ariaLabel={t("mealDetail.insightBasis")} />
          </View>
          <Text className="meal-detail-page__insight-content">{meal.insight}</Text>
          <View className="meal-detail-page__insight-action">
            <Text>{t("mealDetail.insightBasis")}</Text>
          </View>
        </View>
      </View>
      <View className="meal-detail-page__template-action"><AppButton variant="secondary" loading={savingTemplate} disabled={templateSaved || !isRemoteMealId(meal.id)} onClick={async () => {
        if (savingTemplate) return;
        setSavingTemplate(true);
        try {
          await saveMealTemplate(meal.id);
          setTemplateSaved(true);
          const dailyCalories = store.getDailySummary(meal.date).consumed.calories;
          useMealSavedCelebrationStore.getState().show({
            kind: "template",
            mealId: meal.id,
            calories: nutrition.calories,
            protein: nutrition.protein,
            carbs: nutrition.carbs,
            fat: nutrition.fat,
            previousCalories: dailyCalories,
            currentCalories: dailyCalories,
            targetCalories: store.dailyTargets.calories,
          });
        }
        catch { feedback.show({ message: t("mealDetail.saveTemplateFailed"), tone: "error" }); }
        finally { setSavingTemplate(false); }
      }}>{t(templateSaved ? "mealDetail.savedTemplate" : "mealDetail.saveTemplate")}</AppButton></View>
      <View className="meal-detail-page__actions">
        <View className="meal-detail-page__action" ariaLabel={t("mealDetail.editMeal")} onClick={edit}>
          <NordicIcon name="pencil" size={22} ariaLabel={t("mealDetail.edit")} />
          <Text>{t("mealDetail.edit")}</Text>
        </View>
        <View className="meal-detail-page__action" ariaLabel={t("mealDetail.repeatMeal")} onClick={repeat}>
          <NordicIcon name="circle-plus" size={22} ariaLabel={t("mealDetail.repeatMeal")} />
          <Text>{t("mealDetail.repeatMeal")}</Text>
        </View>
        <View
          className={`meal-detail-page__action ${meal.favorite ? "meal-detail-page__action--favorite" : ""}`}
          ariaLabel={t(meal.favorite ? "mealDetail.unfavoriteMeal" : "mealDetail.favoriteMeal")}
          onClick={() => void toggleFavorite()}
        >
          <NordicIcon
            name={meal.favorite ? "heart-filled" : "heart"}
            size={22}
            ariaLabel={t(meal.favorite ? "mealDetail.unfavorite" : "mealDetail.favorite")}
          />
          <Text>{t(meal.favorite ? "mealDetail.favorited" : "mealDetail.favorite")}</Text>
        </View>
        <View
          className="meal-detail-page__action meal-detail-page__action--delete"
          ariaLabel={t("mealDetail.deleteMeal")}
          onClick={() => setDeleteDialogOpen(true)}
        >
          <NordicIcon name="trash-2" size={22} ariaLabel={t("mealDetail.delete")} />
          <Text>{t("mealDetail.delete")}</Text>
        </View>
      </View>
      <Modal open={detailModal !== null}>
        <View className="meal-detail-page__detail-modal">
          <View className="meal-detail-page__detail-modal-head">
            <Text className="meal-detail-page__detail-modal-title">
              {t(detailModal === "score" ? "mealDetail.scoreBasis" : "mealDetail.insight")}
            </Text>
          </View>
          {detailModal === "score" ? (
            <View className="meal-detail-page__detail-modal-body">
              <Text className="meal-detail-page__detail-modal-lead">{t("mealDetail.scoreWhy")}</Text>
              {scoreDetail.reasons.map((reason) => (
                <View className="meal-detail-page__score-card-reason" key={reason}>
                  <NordicIcon name="check" size={14} ariaLabel={t("mealDetail.scoreBasis")} />
                  <Text>{reason}</Text>
                </View>
              ))}
            </View>
          ) : (
            <View className="meal-detail-page__detail-modal-body">
              <Text className="meal-detail-page__detail-modal-lead">{meal.insight}</Text>
              <View className="meal-detail-page__modal-metrics">
                <View>
                  <Text>{t("mealDetail.mealProtein")}</Text>
                  <Text>{nutrition.protein}g</Text>
                </View>
                <View>
                  <Text>{t("mealDetail.mealCarbs")}</Text>
                  <Text>{nutrition.carbs}g</Text>
                </View>
              </View>
              <Text className="meal-detail-page__detail-modal-note">
                {t("mealDetail.insightNote")}
              </Text>
            </View>
          )}
          <AppButton size="large" onClick={() => setDetailModal(null)}>
            {t("mealDetail.gotIt")}
          </AppButton>
        </View>
      </Modal>
      <ConfirmDialog
        open={deleteDialogOpen}
        title={t("mealDetail.deleteQuestion")}
        description={t("mealDetail.deleteDescription")}
        confirmLabel={t("mealDetail.delete")}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          setDeleteDialogOpen(false);
          void remove();
        }}
      />
    </PageLayout>
  );
}
