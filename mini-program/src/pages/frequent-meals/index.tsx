import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import { getMealTemplates, deleteMealTemplate, templateToMeal, type MealTemplate } from "../../api/meal-template-api";
import { AppButton } from "../../components/app-button";
import { ConfirmDialog } from "../../components/confirm-dialog";
import { EmptyState } from "../../components/empty-state";
import { ErrorState } from "../../components/error-state";
import { Loading } from "../../components/loading";
import { NordicIcon } from "../../components/nordic-icon";
import { getMealNutrition, type MealType } from "../../features/meals/domain";
import { mealTypeOptions } from "../../features/meals/meal-type";
import { PageLayout } from "../../layouts/page-layout";
import { usePortionDraftStore } from "../../stores/portion-draft-store";
import "./index.scss";

function FrequentMealsSkeleton() {
  return (
    <View className="frequent-meals__loading" ariaLabel={t("frequentMeals.loading")}>
      <View className="frequent-meals__loading-status"><Loading label={t("frequentMeals.loading")} /></View>
      {[0, 1].map((index) => (
        <View className="frequent-meals__skeleton-card" key={index}>
          <View className="frequent-meals__skeleton-main">
            <View className="frequent-meals__skeleton-image skeleton" />
            <View className="frequent-meals__skeleton-copy">
              <View className="frequent-meals__skeleton-line frequent-meals__skeleton-line--title skeleton" />
              <View className="frequent-meals__skeleton-line frequent-meals__skeleton-line--ingredients skeleton" />
              <View className="frequent-meals__skeleton-metrics">
                <View className="frequent-meals__skeleton-metric skeleton" />
                <View className="frequent-meals__skeleton-metric skeleton" />
              </View>
            </View>
          </View>
          <View className="frequent-meals__skeleton-footer">
            <View className="frequent-meals__skeleton-date skeleton" />
            <View className="frequent-meals__skeleton-button skeleton" />
          </View>
        </View>
      ))}
    </View>
  );
}

export default function FrequentMealsPage() {
  const { i18n } = useTranslation();
  const [meals, setMeals] = useState<MealTemplate[]>([]);
  const [filter, setFilter] = useState<MealType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [brokenImages, setBrokenImages] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MealTemplate | null>(null);
  const request = useRef(0);
  const load = async () => {
    const version = ++request.current;
    setLoading(true);
    setFailed(false);
    try {
      const result = await getMealTemplates();
      if (version === request.current) setMeals(result);
    } catch {
      if (version === request.current) setFailed(true);
    } finally {
      if (version === request.current) setLoading(false);
    }
  };
  useDidShow(() => { void load(); });
  const deleteTemplate = async (template: MealTemplate) => {
    try {
      await deleteMealTemplate(template.id);
      await load();
    } catch {
      void Taro.showToast({ title: t("frequentMeals.deleteFailed"), icon: "none" });
    }
  };
  const visible = meals.filter((meal) => filter === "all" || meal.mealType === filter);
  return (
    <PageLayout title={t("frequentMeals.title")} hideNavigation showBack showTabs={false} onTopBarBack={() => { void Taro.navigateBack(); }}>
      <View className="frequent-meals" onClick={() => setOpenMenuId(null)}>
        <View className="frequent-meals__intro">
          <Text className="frequent-meals__title">{t("frequentMeals.title")}</Text>
          <Text className="frequent-meals__subtitle">{t("frequentMeals.intro")}</Text>
        </View>
        <View className="frequent-meals__filters" ariaLabel={t("frequentMeals.filterAria")}>
          {[{ value: "all" as const, label: t("meals.all") }, ...mealTypeOptions].map((option) => (
            <Button key={option.value} className={`frequent-meals__filter ${filter === option.value ? "frequent-meals__filter--active" : ""}`} ariaLabel={`${option.value === "all" ? t("meals.all") : t(`meals.${option.value}`)}${filter === option.value ? t("frequentMeals.selected") : ""}`} onClick={() => setFilter(option.value)}>{option.value === "all" ? t("meals.all") : t(`meals.${option.value}`)}</Button>
          ))}
        </View>
        {loading ? <FrequentMealsSkeleton /> : failed ? (
          <ErrorState title={t("frequentMeals.loadFailed")} description={t("frequentMeals.checkNetwork")} onRetry={() => { void load(); }} />
        ) : visible.length === 0 ? (
          <EmptyState title={t(filter === "all" ? "frequentMeals.empty" : "frequentMeals.emptyFilter")} description={t("frequentMeals.emptyHint")} actionLabel={t("frequentMeals.logOne")} onAction={() => { void Taro.navigateTo({ url: "/pages/manual-meal/index" }); }} />
        ) : visible.map((template) => {
          const meal = templateToMeal(template);
          const nutrition = getMealNutrition(meal);
          return (
            <View className={`frequent-meals__card ${openMenuId === template.id ? "frequent-meals__card--menu-open" : ""}`} key={meal.id}>
              <View className="frequent-meals__main">
                <View className="frequent-meals__image">
                  {meal.imageUrl && !brokenImages.includes(meal.id) ? <Image src={meal.imageUrl} mode="aspectFill" onError={() => setBrokenImages((ids) => [...ids, meal.id])} /> : <NordicIcon name="utensils" size={32} ariaLabel={t("frequentMeals.meal")} />}
                </View>
                <View className="frequent-meals__copy">
                  <Text className="frequent-meals__name">{meal.title}</Text>
                  <Text className="frequent-meals__ingredients">{meal.items.map((item) => item.name).join(" · ")}</Text>
                  <View className="frequent-meals__metrics"><Text>{Math.round(nutrition.calories)} kcal</Text><Text>{t("frequentMeals.protein", { value: Math.round(nutrition.protein) })}</Text></View>
                </View>
                <Button className={`frequent-meals__more ${openMenuId === template.id ? "frequent-meals__more--active" : ""}`} ariaLabel={t("frequentMeals.manage", { name: meal.title })} onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenuId((current) => current === template.id ? null : template.id);
                }}><NordicIcon name="ellipsis" size={20} /></Button>
              </View>
              {openMenuId === template.id ? (
                <View className="frequent-meals__menu" ariaLabel={t("frequentMeals.manage", { name: meal.title })} onClick={(event) => event.stopPropagation()}>
                  <Text className="frequent-meals__menu-title">{t("frequentMeals.menuTitle")}</Text>
                  <View className="frequent-meals__menu-item" onClick={() => { setOpenMenuId(null); void Taro.navigateTo({ url: `/pages/frequent-meal-edit/index?id=${template.id}` }); }}>
                    <NordicIcon name="pencil" size={18} /><Text>{t("frequentMeals.edit")}</Text>
                  </View>
                  <View className="frequent-meals__menu-item frequent-meals__menu-item--danger" onClick={() => {
                    setOpenMenuId(null);
                    setDeleteTarget(template);
                  }}>
                    <NordicIcon name="trash-2" size={18} /><Text>{t("frequentMeals.delete")}</Text>
                  </View>
                </View>
              ) : null}
              <View className="frequent-meals__footer">
                <Text className="frequent-meals__date">{t("frequentMeals.lastLogged", { date: template.lastRecordedAt ? new Date(template.lastRecordedAt).toLocaleDateString(i18n.language, { timeZone: "Asia/Shanghai" }) : t("frequentMeals.neverUsed"), count: template.useCount })}</Text>
                <AppButton size="small" ariaLabel={t("frequentMeals.logAgain", { name: meal.title })} onClick={() => {
                  usePortionDraftStore.getState().startMealRepeat(meal, template.id);
                  void Taro.navigateTo({ url: "/pages/portion-adjustment/index?mode=repeat" });
                }}><NordicIcon name="calendar-days" size={16} /><Text>{t("frequentMeals.log")}</Text></AppButton>
              </View>
            </View>
          );
        })}
      </View>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title={t("frequentMeals.deleteQuestion")}
        description={t("frequentMeals.deleteDescription")}
        confirmLabel={t("frequentMeals.delete")}
        cancelLabel={t("common.cancel")}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (target) void deleteTemplate(target);
        }}
      />
    </PageLayout>
  );
}
