import { Input, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { useEffect, useMemo, useRef, useState } from "react";
import { getProductFoodInsight, getProductFoodVariants, type ProductFoodCatalogItem, type ProductFoodInsight } from "../../api/food-catalog-api";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { FoodThumbnail } from "../../components/food-thumbnail";
import { resolveHorizontalSwipe, siblingIndex } from "../../features/food-catalog/detail-swipe";
import { getFoodCategory, getFoodTags } from "../../features/food-catalog/food-labels";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import { useRecognitionFeedbackStore } from "../../stores/recognition-feedback-store";
import { navigateBackOrHome } from "../../utils/navigation";

const portionOptions = [100, 150, 200];

type TouchPoint = { clientX: number; clientY: number };

function readTouch(event: unknown, key: "touches" | "changedTouches"): TouchPoint | null {
  if (!event || typeof event !== "object") return null;
  const value = (event as Record<string, unknown>)[key];
  if (!Array.isArray(value)) return null;
  const touch = value[0];
  if (!touch || typeof touch !== "object") return null;
  const { clientX, clientY } = touch as Record<string, unknown>;
  return typeof clientX === "number" && typeof clientY === "number" ? { clientX, clientY } : null;
}

const scaleNutrition = (value: number | null, grams: number) => {
  if (value === null) return "—";
  return `${Math.round((value * grams) / 10) / 10}`;
};

export default function FoodDetailPage() {
  const router = useRouter();
  const feedback = useFeedbackStore();
  const food = useFoodSelectionStore((state) => state.detailFood);
  const detailQueue = useFoodSelectionStore((state) => state.detailQueue);
  const inspectFood = useFoodSelectionStore((state) => state.inspectFood);
  const selectFood = useFoodSelectionStore((state) => state.selectFood);
  const fromManualMeal = router.params.mode === "select";
  const recognitionMode = router.params.mode === "recognition-replace" || router.params.mode === "recognition-add"
    ? router.params.mode
    : null;
  const [portionG, setPortionG] = useState(150);
  const [activeFood, setActiveFood] = useState<ProductFoodCatalogItem | null>(food);
  const [variants, setVariants] = useState<ProductFoodCatalogItem[]>([]);
  const [variantsForId, setVariantsForId] = useState<string | null>(null);
  const [insight, setInsight] = useState<ProductFoodInsight | null>(null);
  const [insightLoading, setInsightLoading] = useState(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const ignoreSwipeUntilRef = useRef(0);
  const returnToCatalog = () => navigateBackOrHome("/pages/food-catalog/index");

  const queue = detailQueue.length > 0 ? detailQueue : food ? [food] : [];
  const queueIndex = (() => {
    if (!food || queue.length === 0) return 0;
    const index = queue.findIndex((item) => item.id === food.id);
    return index >= 0 ? index : 0;
  })();

  useEffect(() => {
    if (!food) {
      setActiveFood(null);
      setVariants([]);
      setVariantsForId(null);
      return;
    }
    let cancelled = false;
    setActiveFood(food);
    void getProductFoodVariants(food.id)
      .then((result) => {
        if (cancelled) return;
        setVariants(result.items ?? []);
        setVariantsForId(food.id);
      })
      .catch(() => {
        if (cancelled) return;
        setVariants([]);
        setVariantsForId(food.id);
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

  const switchSibling = (delta: -1 | 1) => {
    const nextIndex = siblingIndex(queueIndex, delta, queue.length);
    if (nextIndex == null) {
      feedback.show({
        message: delta < 0 ? "已经是第一个" : "已经是最后一个",
        tone: "default",
      });
      return;
    }
    const nextFood = queue[nextIndex];
    if (!nextFood) return;
    ignoreSwipeUntilRef.current = Date.now() + 320;
    inspectFood(nextFood, queue);
    setPortionG(150);
  };

  // Taro View types touch handlers as CommonEventFunction (BaseEventOrig), while
  // runtime events include touches — keep a narrow structural read without fighting JSX types.
  const onTouchStart = (event: unknown) => {
    const touch = readTouch(event, "touches") ?? readTouch(event, "changedTouches");
    if (!touch) return;
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const onTouchEnd = (event: unknown) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    const touch = readTouch(event, "changedTouches");
    if (!start || !touch || queue.length <= 1) return;
    if (Date.now() < ignoreSwipeUntilRef.current) return;
    const direction = resolveHorizontalSwipe(touch.clientX - start.x, touch.clientY - start.y);
    if (direction !== 0) switchSibling(direction);
  };

  if (!displayedFood) {
    return (
      <PageLayout
        title="食物详情"
        showTabs={false}
        hideNavigation
        className="page-layout--food-detail"
      >
        <View className="food-detail-page food-detail-page--empty">
          <NordicIcon name="food-bowl" size={32} ariaLabel="食物详情" />
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
    if (recognitionMode) {
      useRecognitionFeedbackStore.getState().setSelectedQuantityG(portionG);
    }
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
      <View
        className="food-detail-page"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
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
          <FoodThumbnail
            className="food-detail-page__image"
            food={displayedFood}
            iconSize={40}
            prefer="detail"
            aspectRatio={1}
          />
          {queue.length > 1 ? (
            <>
              <View
                className={`food-detail-page__nav food-detail-page__nav--prev ${
                  queueIndex <= 0 ? "food-detail-page__nav--disabled" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation?.();
                  switchSibling(-1);
                }}
                onTouchStart={(event) => {
                  event.stopPropagation?.();
                  ignoreSwipeUntilRef.current = Date.now() + 320;
                }}
                onTouchEnd={(event) => {
                  event.stopPropagation?.();
                }}
                ariaLabel="上一个食物"
              >
                <Text className="food-detail-page__nav-icon">‹</Text>
              </View>
              <View
                className={`food-detail-page__nav food-detail-page__nav--next ${
                  queueIndex >= queue.length - 1 ? "food-detail-page__nav--disabled" : ""
                }`}
                onClick={(event) => {
                  event.stopPropagation?.();
                  switchSibling(1);
                }}
                onTouchStart={(event) => {
                  event.stopPropagation?.();
                  ignoreSwipeUntilRef.current = Date.now() + 320;
                }}
                onTouchEnd={(event) => {
                  event.stopPropagation?.();
                }}
                ariaLabel="下一个食物"
              >
                <Text className="food-detail-page__nav-icon">›</Text>
              </View>
            </>
          ) : null}
        </View>

        {displayedFood && variantsForId === displayedFood.id && variants.length > 1 ? (
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
                <Text className="food-detail-page__portion-chip-label">{option}g</Text>
              </View>
            ))}
          </View>
          <View className="food-detail-page__portion-custom">
            <Text className="food-detail-page__portion-custom-label">自定义</Text>
            <View className="food-detail-page__portion-input">
              <Input
                className="food-detail-page__portion-value"
                type="number"
                value={String(portionG)}
                onInput={(event) => {
                  const next = Number(event.detail.value);
                  if (Number.isFinite(next) && next > 0 && next <= 2000) setPortionG(next);
                }}
              />
              <Text className="food-detail-page__portion-unit">g</Text>
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
            <NordicIcon name="nova" size={20} ariaLabel="营养洞察" />
          </View>
          <View>
            <Text className="food-detail-page__insight-title">NOVA · 营养洞察</Text>
            {insight?.headline ? <Text className="food-detail-page__insight-headline">{insight.headline}</Text> : null}
            <Text className="food-detail-page__insight-copy">
              {insightLoading ? "NOVA 正在根据这份食物的真实营养数据生成介绍…" : (insight?.content ?? "云端洞察暂时不可用，请稍后重试。")}
            </Text>
          </View>
        </View>
      </View>

      <View className="food-detail-page__action">
        <AppButton size="large" onClick={fromManualMeal || recognitionMode ? addToManualMeal : returnToCatalog}>
          {recognitionMode === "recognition-replace"
            ? "替换当前食物"
            : recognitionMode === "recognition-add"
              ? `添加 ${portionG}g 到本次识别`
              : fromManualMeal
                ? "添加到本餐"
                : "知道了"}
        </AppButton>
      </View>
    </PageLayout>
  );
}
