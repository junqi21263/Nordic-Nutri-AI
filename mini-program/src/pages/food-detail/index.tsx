import { Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useState } from "react";
import { getProductFoodInsight, getProductFoodVariants, type ProductFoodCatalogItem, type ProductFoodInsight } from "../../api/food-catalog-api";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { FoodThumbnail } from "../../components/food-thumbnail";
import { getFoodCategory, getFoodTags } from "../../features/food-catalog/food-labels";
import { PageLayout } from "../../layouts/page-layout";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import { navigateBackOrHome } from "../../utils/navigation";

const portionOptions = [100, 150, 200];

const scaleNutrition = (value: number | null, grams: number) => {
  if (value === null) return "—";
  return `${Math.round((value * grams) / 10) / 10}`;
};

export default function FoodDetailPage() {
  const router = useRouter();
  const food = useFoodSelectionStore((state) => state.detailFood);
  const selectFood = useFoodSelectionStore((state) => state.selectFood);
  const fromManualMeal = router.params.mode === "select";
  const [portionG, setPortionG] = useState(150);
  const [activeFood, setActiveFood] = useState<ProductFoodCatalogItem | null>(food);
  const [variants, setVariants] = useState<ProductFoodCatalogItem[]>([]);
  const [insight, setInsight] = useState<ProductFoodInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const returnToCatalog = () => navigateBackOrHome("/pages/food-catalog/index");

  useEffect(() => {
    if (!food) {
      setActiveFood(null);
      setVariants([]);
      return;
    }
    let cancelled = false;
    setActiveFood(food);
    setVariants([]);
    void getProductFoodVariants(food.id)
      .then((result) => {
        if (!cancelled) setVariants(result.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setVariants([]);
      });
    return () => {
      cancelled = true;
    };
  }, [food]);

  const displayedFood = activeFood ?? food;

  const tags = useMemo(() => (displayedFood ? getFoodTags(displayedFood) : []), [displayedFood]);
  useEffect(() => {
    if (!displayedFood) {
      setInsight(null);
      setInsightLoading(false);
      return;
    }
    let cancelled = false;
    setInsight(null);
    setInsightLoading(true);
    void getProductFoodInsight(displayedFood.id)
      .then((result) => {
        if (!cancelled) setInsight(result);
      })
      .catch(() => {
        if (!cancelled) setInsight(null);
      })
      .finally(() => {
        if (!cancelled) setInsightLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [displayedFood?.id]);
  const nutrition = useMemo(
    () =>
      displayedFood
        ? [
            { label: "热量", value: `${scaleNutrition(displayedFood.caloriesKcalPer100g, portionG)} kcal`, icon: "flame" as const },
            { label: "蛋白质", value: `${scaleNutrition(displayedFood.proteinGPer100g, portionG)} g`, icon: "protein" as const },
            { label: "碳水", value: `${scaleNutrition(displayedFood.carbsGPer100g, portionG)} g`, icon: "carbs" as const },
            { label: "脂肪", value: `${scaleNutrition(displayedFood.fatGPer100g, portionG)} g`, icon: "fat" as const },
          ]
        : [],
    [displayedFood, portionG],
  );

  if (!displayedFood) {
    return (
      <PageLayout
        title="食物详情"
        showTabs={false}
        hideNavigation
        className="page-layout--food-detail"
      >
        <View className="food-detail-page food-detail-page--empty">
          <NordicIcon name="utensils" size={32} ariaLabel="食物详情" />
          <Text className="food-detail-page__empty-title">没有可展示的食物</Text>
          <Text className="food-detail-page__empty-copy">请返回食物库重新选择。</Text>
          <AppButton size="large" onClick={returnToCatalog}>
            知道了
          </AppButton>
        </View>
      </PageLayout>
    );
  }

  const addToManualMeal = () => {
    selectFood(displayedFood);
    void Taro.navigateBack({ delta: 2 });
  };

  return (
    <PageLayout
      title="食物详情"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => Taro.navigateBack()}
      className="page-layout--food-detail"
    >
      <View className="food-detail-page">
        <View className="food-detail-page__identity">
          <View className="food-detail-page__name-row">
            <Text className="food-detail-page__name">{displayedFood.description}</Text>
            <Text className="food-detail-page__calories-inline">
              ｜{scaleNutrition(displayedFood.caloriesKcalPer100g, 100)}kcal/100g
            </Text>
          </View>
          <View className="food-detail-page__labels">
            <Text className="food-detail-page__category">{getFoodCategory(displayedFood)}</Text>
            {tags.map((tag) => (
              <Text className="food-detail-page__tag" key={tag}>
                {tag}
              </Text>
            ))}
          </View>
        </View>

        <View className="food-detail-page__hero food-detail-page__hero--square">
          <FoodThumbnail className="food-detail-page__image" food={displayedFood} iconSize={40} prefer="detail" />
        </View>

        {variants.length > 1 ? (
          <View className="food-detail-page__variants">
            <View className="food-detail-page__section-heading">
              <Text>版本选择</Text>
              <Text>{variants.length} 个营养版本</Text>
            </View>
            <View className="food-detail-page__variants-list">
              {variants.map((variant) => (
                <View
                  className={`food-detail-page__variant ${variant.id === displayedFood.id ? "food-detail-page__variant--active" : ""}`}
                  key={variant.id}
                  onClick={() => setActiveFood(variant)}
                >
                  <Text className="food-detail-page__variant-title">
                    {variant.variantLabelZh || (variant.isPrimaryVariant ? "推荐版本" : "其他营养版本")}
                  </Text>
                  <Text className="food-detail-page__variant-meta">
                    {variant.caloriesKcalPer100g ?? "—"} kcal · 蛋白质 {variant.proteinGPer100g ?? "—"}g
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View className="food-detail-page__portion">
          <Text className="food-detail-page__portion-title">份量选择</Text>
          <View className="food-detail-page__portion-row">
            {portionOptions.map((option) => (
              <View
                className={`food-detail-page__portion-chip ${portionG === option ? "food-detail-page__portion-chip--active" : ""}`}
                key={option}
                onClick={() => setPortionG(option)}
              >
                <Text>{option}g</Text>
              </View>
            ))}
          </View>
          <View className="food-detail-page__portion-custom">
            <Text>自定义</Text>
            <View className="food-detail-page__portion-input">
              <Input
                type="number"
                value={String(portionG)}
                onInput={(event) => {
                  const next = Number(event.detail.value);
                  if (Number.isFinite(next) && next > 0 && next <= 2000) setPortionG(next);
                }}
              />
              <Text>g</Text>
            </View>
          </View>
        </View>

        <View className="food-detail-page__section-heading">
          <Text>营养成分</Text>
          <Text>{portionG}g</Text>
        </View>
        <View className="food-detail-page__nutrition-grid">
          {nutrition.map((item) => (
            <View className="food-detail-page__nutrition-item" key={item.label}>
              <View className="food-detail-page__nutrition-head">
                <NordicIcon name={item.icon} size={18} ariaLabel={item.label} />
                <Text>{item.label}</Text>
              </View>
              <Text>{item.value}</Text>
            </View>
          ))}
        </View>

        <View className="food-detail-page__insight">
          <View className="food-detail-page__insight-icon">
            <NordicIcon name="sparkles" size={20} ariaLabel="营养洞察" />
          </View>
          <View>
            <Text className="food-detail-page__insight-title">NOVA AI · 营养洞察</Text>
            {insight?.headline ? <Text className="food-detail-page__insight-headline">{insight.headline}</Text> : null}
            <Text className="food-detail-page__insight-copy">
              {insightLoading ? "NOVA 正在根据这份食物的真实营养数据生成介绍…" : (insight?.content ?? "云端洞察暂时不可用，请稍后重试。")}
            </Text>
          </View>
        </View>
      </View>

      <View className="food-detail-page__action">
        <AppButton size="large" onClick={fromManualMeal ? addToManualMeal : returnToCatalog}>
          {fromManualMeal ? "添加到本餐" : "知道了"}
        </AppButton>
      </View>
    </PageLayout>
  );
}
