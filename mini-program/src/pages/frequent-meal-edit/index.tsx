import { Button, Image, Input, Text, View } from "@tarojs/components";
import Taro, { useRouter, useDidShow } from "@tarojs/taro";
import { useEffect, useRef, useState } from "react";
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
  return (
    <View className="template-editor__loading" ariaLabel="正在加载常吃详情">
      <Loading label="正在加载常吃详情…" />
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
      void Taro.showToast({ title: "该食物营养数据不完整", icon: "none" }); return;
    }
    setDraft((current) => current && current.items.length < 20 ? { ...current, items: [...current.items, { name: food.description, quantityG: 100, caloriesPer100g: food.caloriesKcalPer100g!, proteinPer100g: food.proteinGPer100g!, carbsPer100g: food.carbsGPer100g!, fatPer100g: food.fatGPer100g! }] } : current);
    setDirty(true);
  });
  const change = (update: Partial<MealTemplate>) => { setDraft((current) => current ? { ...current, ...update } : current); setDirty(true); };
  const back = async () => {
    if (busy.current) return;
    if (dirty && !(await Taro.showModal({ title: "放弃未保存的修改？", confirmText: "放弃修改" })).confirm) return;
    void Taro.navigateBack();
  };
  const save = async () => {
    if (!draft || busy.current) return;
    if (!draft.name.trim() || !draft.items.length || draft.items.some((item) => !Number.isFinite(item.quantityG) || item.quantityG <= 0 || item.quantityG > 2000)) {
      void Taro.showToast({ title: "请填写名称和有效份量（1–2000g）", icon: "none" }); return;
    }
    busy.current = true; setSaving(true);
    try {
      const result = await updateMealTemplate(draft.id, { name: draft.name, mealType: draft.mealType, items: draft.items });
      if (!result) throw new Error("Missing template");
      setDirty(false); void Taro.showToast({ title: "已保存修改", icon: "success" }); void Taro.navigateBack();
    } catch { void Taro.showToast({ title: "保存失败，修改已保留", icon: "none" }); }
    finally { busy.current = false; setSaving(false); }
  };
  const nutrition = draft ? getMealNutrition(templateToMeal(draft)) : null;
  return <PageLayout title="编辑常吃" hideNavigation showBack showTabs={false} onTopBarBack={() => { void back(); }}>
    <View className="template-editor">
      <Text className="frequent-meals__title">编辑常吃</Text>
      {loading ? <FrequentMealEditSkeleton /> : error || !draft ? <ErrorState title="常吃不存在或暂时无法加载" description="请返回常吃列表，或重试。" onRetry={() => { void load(); }} /> : <>
        <View className="template-editor__card">
          {draft.imageUrl && !brokenImage ? <Image className="template-editor__cover" src={draft.imageUrl} mode="aspectFill" onError={() => setBrokenImage(true)} /> : <View className="template-editor__cover template-editor__placeholder"><NordicIcon name="utensils" size={48} /></View>}
          <Text className="template-editor__label">餐食名称</Text>
          <View className="template-editor__input-shell">
            <Input className="template-editor__input" value={draft.name} maxlength={100} ariaLabel="餐食名称" onInput={(event) => change({ name: event.detail.value })} />
          </View>
          <Text className="template-editor__label">默认餐次</Text>
          <View className="template-editor__types">{mealTypeOptions.map((option) => <Button key={option.value} className={`frequent-meals__filter ${draft.mealType === option.value ? "frequent-meals__filter--active" : ""}`} onClick={() => change({ mealType: option.value })}>{option.label}</Button>)}</View>
        </View>
        <View className="template-editor__card">
          <Text className="frequent-meals__name">食物组成 · {draft.items.length} 项</Text>
          <Text className="frequent-meals__subtitle">调整默认份量，不会修改已经记录的餐食。</Text>
          {draft.items.map((item, index) => <View className="template-editor__food" key={index}>
            <View className="template-editor__food-copy"><Text>{item.name}</Text><Text className="frequent-meals__date">{Math.round(item.caloriesPer100g * item.quantityG / 100)} kcal</Text></View>
            <View className="template-editor__quantity"><View className="template-editor__quantity-input-shell"><Input className="template-editor__quantity-input" type="digit" value={String(item.quantityG)} ariaLabel={`${item.name}份量克`} onInput={(event) => change({ items: draft.items.map((food, i) => i === index ? { ...food, quantityG: Number(event.detail.value) } : food) })} /></View><Text>g</Text></View>
            <Button className="template-editor__remove" ariaLabel={`移除${item.name}`} onClick={() => change({ items: draft.items.filter((_, i) => i !== index) })}><NordicIcon name="trash-2" size={18} /></Button>
          </View>)}
          <AppButton variant="secondary" disabled={draft.items.length >= 20} onClick={() => {
            useFoodSelectionStore.getState().consumeSelectedFood();
            void Taro.navigateTo({ url: "/pages/food-catalog/index?mode=select" });
          }}>＋ 添加食物</AppButton>
        </View>
        <View className="template-editor__card"><Text className="template-editor__label">预计能量总计</Text><Text className="template-editor__energy">{Math.round(nutrition!.calories)} kcal</Text><View className="template-editor__macros"><Text>蛋白质 {Math.round(nutrition!.protein)}g</Text><Text>碳水 {Math.round(nutrition!.carbs)}g</Text><Text>脂肪 {Math.round(nutrition!.fat)}g</Text></View></View>
        <AppButton variant="ghost" disabled={saving} onClick={async () => {
          if (busy.current || !(await Taro.showModal({ title: "删除这项常吃？", content: "已经记录的餐食不受影响。", confirmText: "删除" })).confirm) return;
          busy.current = true; setSaving(true);
          try { await deleteMealTemplate(draft.id); setDirty(false); void Taro.navigateBack(); }
          catch { void Taro.showToast({ title: "删除失败，请重试", icon: "none" }); }
          finally { busy.current = false; setSaving(false); }
        }}>删除此常吃</AppButton>
        <View className="template-editor__save"><AppButton size="large" loading={saving} onClick={() => { void save(); }}>保存修改</AppButton></View>
      </>}
    </View>
  </PageLayout>;
}
