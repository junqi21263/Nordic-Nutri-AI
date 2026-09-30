import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro, { useRouter, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getMealTemplate, updateMealTemplate, deleteMealTemplate, templateToMeal, type MealTemplate } from "../../api/meal-template-api";
import { AppButton } from "../../components/app-button";
import { ErrorState } from "../../components/error-state";
import { Loading } from "../../components/loading";
import { NordicIcon } from "../../components/nordic-icon";
import { getMealNutrition } from "../../features/meals/domain";
import { mealTypeOptions } from "../../features/meals/meal-type";
import { PageLayout } from "../../layouts/page-layout";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import "../frequent-meals/index.scss";
import "./index.scss";

function FrequentMealEditSkeleton() {
  const { t } = useTranslation();
  return (
    <View className="template-editor__loading" ariaLabel={t("frequentMealEdit.loading")}>
      <Loading label={`${t("frequentMealEdit.loading")}…`} />
      <View className="template-editor__card">
        <View className="template-editor__skeleton-cover skeleton" />
        <View className="template-editor__skeleton-label skeleton" />
        <View className="template-editor__skeleton-input skeleton" />
        <View className="template-editor__skeleton-label template-editor__skeleton-label--short skeleton" />
        <View className="template-editor__skeleton-types">
          {[0, 1, 2, 3].map((index) => <View className="template-editor__skeleton-type skeleton" key={index} />)}
        </View>
      </View>
      <View className="template-editor__card template-editor__skeleton-food-card">
        <View className="template-editor__skeleton-heading skeleton" />
        {[0, 1].map((index) => <View className="template-editor__skeleton-food skeleton" key={index} />)}
      </View>
    </View>
  );
}

export default function FrequentMealEditPage() {
  const { t } = useTranslation();
  const { params } = useRouter();
  const [draft, setDraft] = useState<MealTemplate | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);
  const busy = useRef(false);
  const load = async () => {
    setLoading(true); setError(false);
    try { const result = await getMealTemplate(params.id ?? ""); setDraft(result); setError(!result); }
    catch { setError(true); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [params.id]);
  useDidShow(() => {
    const food = useFoodSelectionStore.getState().consumeSelectedFood();
    if (!food) return;
    if ([food.caloriesKcalPer100g, food.proteinGPer100g, food.carbsGPer100g, food.fatGPer100g].some((value) => value == null)) {
      void Taro.showToast({ title: t("frequentMealEdit.nutritionIncomplete"), icon: "none" }); return;
    }
    setDraft((current) => current && current.items.length < 20 ? { ...current, items: [...current.items, { name: food.description, quantityG: 100, caloriesPer100g: food.caloriesKcalPer100g!, proteinPer100g: food.proteinGPer100g!, carbsPer100g: food.carbsGPer100g!, fatPer100g: food.fatGPer100g! }] } : current);
    setDirty(true);
  });
  const change = (update: Partial<MealTemplate>) => { setDraft((current) => current ? { ...current, ...update } : current); setDirty(true); };
  const back = async () => {
    if (busy.current) return;
    if (dirty && !(await Taro.showModal({ title: t("frequentMealEdit.discardTitle"), confirmText: t("frequentMealEdit.discard") })).confirm) return;
    void Taro.navigateBack();
  };
  const save = async () => {
    if (!draft || busy.current) return;
    if (!draft.name.trim() || !draft.items.length || draft.items.some((item) => !Number.isFinite(item.quantityG) || item.quantityG <= 0 || item.quantityG > 2000)) {
      void Taro.showToast({ title: t("frequentMealEdit.invalid"), icon: "none" }); return;
    }
    busy.current = true; setSaving(true);
    try {
      const result = await updateMealTemplate(draft.id, { name: draft.name, mealType: draft.mealType, items: draft.items });
      if (!result) throw new Error("Missing template");
      setDirty(false); void Taro.showToast({ title: t("frequentMealEdit.saved"), icon: "success" }); void Taro.navigateBack();
    } catch { void Taro.showToast({ title: t("frequentMealEdit.saveFailed"), icon: "none" }); }
    finally { busy.current = false; setSaving(false); }
  };
  const nutrition = draft ? getMealNutrition(templateToMeal(draft)) : null;
  return <PageLayout title={t("frequentMealEdit.title")} hideNavigation showBack showTabs={false} onTopBarBack={() => { void back(); }}>
    <View className="template-editor">
      <Text className="frequent-meals__title">{t("frequentMealEdit.title")}</Text>
      {loading ? <FrequentMealEditSkeleton /> : error || !draft ? <ErrorState title={t("frequentMealEdit.missing")} description={t("frequentMealEdit.retry")} onRetry={() => { void load(); }} /> : <>
        <View className="template-editor__card">
          {draft.imageUrl && !brokenImage ? <Image className="template-editor__cover" src={draft.imageUrl} mode="aspectFill" onError={() => setBrokenImage(true)} /> : <View className="template-editor__cover template-editor__placeholder"><NordicIcon name="utensils" size={48} /></View>}
          <Text className="template-editor__label">{t("frequentMealEdit.mealName")}</Text>
          <View className="template-editor__input-shell">
            <Input className="template-editor__input" value={draft.name} maxlength={100} ariaLabel={t("frequentMealEdit.mealName")} onInput={(event) => change({ name: event.detail.value })} />
          </View>
          <Text className="template-editor__label">{t("frequentMealEdit.mealType")}</Text>
          <View className="template-editor__types">{mealTypeOptions.map((option) => <Button key={option.value} className={`frequent-meals__filter ${draft.mealType === option.value ? "frequent-meals__filter--active" : ""}`} onClick={() => change({ mealType: option.value })}>{t(`meals.${option.value}`)}</Button>)}</View>
        </View>
        <View className="template-editor__card">
          <Text className="frequent-meals__name">{t("frequentMealEdit.foodCount", { count: draft.items.length })}</Text>
          <Text className="frequent-meals__subtitle">{t("frequentMealEdit.subtitle")}</Text>
          {draft.items.map((item, index) => <View className="template-editor__food" key={index}>
            <View className="template-editor__food-copy"><Text>{item.name}</Text><Text className="frequent-meals__date">{Math.round(item.caloriesPer100g * item.quantityG / 100)} kcal</Text></View>
            <View className="template-editor__quantity"><View className="template-editor__quantity-input-shell"><Input className="template-editor__quantity-input" type="digit" value={String(item.quantityG)} ariaLabel={t("frequentMealEdit.itemQuantity", { name: item.name })} onInput={(event) => change({ items: draft.items.map((food, i) => i === index ? { ...food, quantityG: Number(event.detail.value) } : food) })} /></View><Text>g</Text></View>
            <Button className="template-editor__remove" ariaLabel={t("frequentMealEdit.remove", { name: item.name })} onClick={() => change({ items: draft.items.filter((_, i) => i !== index) })}><NordicIcon name="trash-2" size={18} /></Button>
          </View>)}
          <AppButton variant="secondary" disabled={draft.items.length >= 20} onClick={() => {
            useFoodSelectionStore.getState().consumeSelectedFood();
            void Taro.navigateTo({ url: "/pages/food-catalog/index?mode=select" });
          }}>{t("frequentMealEdit.addFood")}</AppButton>
        </View>
        <View className="template-editor__card"><Text className="template-editor__label">{t("frequentMealEdit.energy")}</Text><Text className="template-editor__energy">{Math.round(nutrition!.calories)} kcal</Text><View className="template-editor__macros"><Text>{t("frequentMealEdit.protein")} {Math.round(nutrition!.protein)}g</Text><Text>{t("frequentMealEdit.carbs")} {Math.round(nutrition!.carbs)}g</Text><Text>{t("frequentMealEdit.fat")} {Math.round(nutrition!.fat)}g</Text></View></View>
        <AppButton variant="ghost" disabled={saving} onClick={async () => {
          if (busy.current || !(await Taro.showModal({ title: t("frequentMealEdit.deleteTitle"), content: t("frequentMealEdit.deleteBody"), confirmText: t("frequentMealEdit.delete") })).confirm) return;
          busy.current = true; setSaving(true);
          try { await deleteMealTemplate(draft.id); setDirty(false); void Taro.navigateBack(); }
          catch { void Taro.showToast({ title: t("frequentMealEdit.deleteFailed"), icon: "none" }); }
          finally { busy.current = false; setSaving(false); }
        }}>{t("frequentMealEdit.deleteSaved")}</AppButton>
        <View className="template-editor__save"><AppButton size="large" loading={saving} onClick={() => { void save(); }}>{t("frequentMealEdit.saveChanges")}</AppButton></View>
      </>}
    </View>
  </PageLayout>;
}
