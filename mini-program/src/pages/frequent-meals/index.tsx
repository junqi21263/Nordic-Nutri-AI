import { Button, Image, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useRef, useState } from "react";
import { getMealTemplates, deleteMealTemplate, templateToMeal, templateLastUsed, type MealTemplate } from "../../api/meal-template-api";
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
    <View className="frequent-meals__loading" ariaLabel="正在加载你的常吃">
      <View className="frequent-meals__loading-status"><Loading label="正在加载你的常吃…" /></View>
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
      void Taro.showToast({ title: "删除失败，请重试", icon: "none" });
    }
  };
  const visible = meals.filter((meal) => filter === "all" || meal.mealType === filter);
  return (
    <PageLayout title="我的常吃" hideNavigation showBack showTabs={false} onTopBarBack={() => { void Taro.navigateBack(); }}>
      <View className="frequent-meals" onClick={() => setOpenMenuId(null)}>
        <View className="frequent-meals__intro">
          <Text className="frequent-meals__title">我的常吃</Text>
          <Text className="frequent-meals__subtitle">把经常吃的保存下来，下次一键记录。</Text>
        </View>
        <View className="frequent-meals__filters" ariaLabel="按餐次筛选常吃">
          {[{ value: "all" as const, label: "全部" }, ...mealTypeOptions].map((option) => (
            <Button key={option.value} className={`frequent-meals__filter ${filter === option.value ? "frequent-meals__filter--active" : ""}`} ariaLabel={`${option.label}${filter === option.value ? "，已选中" : ""}`} onClick={() => setFilter(option.value)}>{option.label}</Button>
          ))}
        </View>
        {loading ? <FrequentMealsSkeleton /> : failed ? (
          <ErrorState title="常吃餐食暂时未能加载" description="请检查网络后重试。" onRetry={() => { void load(); }} />
        ) : visible.length === 0 ? (
          <EmptyState title={filter === "all" ? "还没有保存常吃" : "这个餐次还没有常吃"} description="遇到经常吃的餐食，可以在餐食详情中选择「保存到我的常吃」，下次不用重新识别。" actionLabel="去记录一餐" onAction={() => { void Taro.navigateTo({ url: "/pages/manual-meal/index" }); }} />
        ) : visible.map((template) => {
          const meal = templateToMeal(template);
          const nutrition = getMealNutrition(meal);
          return (
            <View className={`frequent-meals__card ${openMenuId === template.id ? "frequent-meals__card--menu-open" : ""}`} key={meal.id}>
              <View className="frequent-meals__main">
                <View className="frequent-meals__image">
                  {meal.imageUrl && !brokenImages.includes(meal.id) ? <Image src={meal.imageUrl} mode="aspectFill" onError={() => setBrokenImages((ids) => [...ids, meal.id])} /> : <NordicIcon name="utensils" size={32} ariaLabel="餐食" />}
                </View>
                <View className="frequent-meals__copy">
                  <Text className="frequent-meals__name">{meal.title}</Text>
                  <Text className="frequent-meals__ingredients">{meal.items.map((item) => item.name).join(" · ")}</Text>
                  <View className="frequent-meals__metrics"><Text>{Math.round(nutrition.calories)} kcal</Text><Text>蛋白质 {Math.round(nutrition.protein)}g</Text></View>
                </View>
                <Button className={`frequent-meals__more ${openMenuId === template.id ? "frequent-meals__more--active" : ""}`} ariaLabel={`管理${meal.title}`} onClick={(event) => {
                  event.stopPropagation();
                  setOpenMenuId((current) => current === template.id ? null : template.id);
                }}><NordicIcon name="ellipsis" size={20} /></Button>
              </View>
              {openMenuId === template.id ? (
                <View className="frequent-meals__menu" ariaLabel={`管理${meal.title}`} onClick={(event) => event.stopPropagation()}>
                  <Text className="frequent-meals__menu-title">管理这项常吃</Text>
                  <View className="frequent-meals__menu-item" onClick={() => { setOpenMenuId(null); void Taro.navigateTo({ url: `/pages/frequent-meal-edit/index?id=${template.id}` }); }}>
                    <NordicIcon name="pencil" size={18} /><Text>编辑</Text>
                  </View>
                  <View className="frequent-meals__menu-item frequent-meals__menu-item--danger" onClick={() => {
                    setOpenMenuId(null);
                    setDeleteTarget(template);
                  }}>
                    <NordicIcon name="trash-2" size={18} /><Text>删除</Text>
                  </View>
                </View>
              ) : null}
              <View className="frequent-meals__footer">
                <Text className="frequent-meals__date">最近记录：{templateLastUsed(template.lastRecordedAt)} · 已记录 {template.useCount} 次</Text>
                <AppButton size="small" ariaLabel={`一键记录${meal.title}`} onClick={() => {
                  usePortionDraftStore.getState().startMealRepeat(meal, template.id);
                  void Taro.navigateTo({ url: "/pages/portion-adjustment/index?mode=repeat" });
                }}><NordicIcon name="calendar-days" size={16} /><Text>一键记录</Text></AppButton>
              </View>
            </View>
          );
        })}
      </View>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="删除常吃？"
        description="仅删除模板，已经记录的餐食不受影响。"
        confirmLabel="删除"
        cancelLabel="取消"
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
