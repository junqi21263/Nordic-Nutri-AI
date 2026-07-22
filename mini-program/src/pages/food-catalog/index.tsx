import { Image, Input, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { discoverProductFoodCatalog, searchProductFoodCatalog, type ProductFoodCatalogItem } from "../../api/food-catalog-api";
import { NordicIcon } from "../../components/nordic-icon";
import { FOOD_CATEGORIES, FOOD_TAGS, getFoodCategory, getFoodTags, matchesFoodFilters, type FoodCategory, type FoodTag } from "../../features/food-catalog/food-labels";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import { navigateBackOrHome } from "../../utils/navigation";

const numberText = (value: number | null, suffix: string) => value === null ? "—" : `${Math.round(value)}${suffix}`;

export default function FoodCatalogPage() {
  const feedback = useFeedbackStore();
  const inspectFood = useFoodSelectionStore((state) => state.inspectFood);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductFoodCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<FoodCategory>("全部");
  const [tagFilter, setTagFilter] = useState<FoodTag>("全部");
  const visibleItems = useMemo(
    () => items.filter((food) => matchesFoodFilters(food, categoryFilter, tagFilter)),
    [categoryFilter, items, tagFilter],
  );

  const discover = async () => {
    setIsSearching(true);
    try {
      const result = await discoverProductFoodCatalog();
      setItems(result.items);
      setHasSearched(false);
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  useDidShow(() => { void discover(); });

  const search = async () => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      feedback.show({ message: "请输入至少两个字母或汉字", tone: "error" });
      return;
    }
    setIsSearching(true);
    try {
      const result = await searchProductFoodCatalog(keyword);
      setItems(result.items);
      setHasSearched(true);
    } catch {
      feedback.show({ message: "食物库暂时不可用，请稍后重试", tone: "error" });
    } finally {
      setIsSearching(false);
    }
  };

  const inspect = (food: ProductFoodCatalogItem) => {
    inspectFood(food);
    const pages = Taro.getCurrentPages();
    const fromManualMeal = pages.length > 1 && pages[pages.length - 2]?.route === "pages/manual-meal/index";
    void Taro.navigateTo({ url: `/pages/food-detail/index${fromManualMeal ? "?mode=select" : ""}` });
  };

  return (
    <PageLayout title="标准食物库" activeTab="food-catalog" hideNavigation className="page-layout--food-catalog">
      <View className="food-catalog-page">
        <View className="food-catalog-page__title-row">
          <View className="food-catalog-page__back" ariaLabel="返回" onClick={() => navigateBackOrHome("/pages/home/index")}>
            <NordicIcon name="back" size={22} ariaLabel="返回" />
          </View>
          <Text>食物库</Text>
        </View>
        <Text className="food-catalog-page__description">查询 USDA 标准营养数据，查看食物详情与每 100g 营养估算。</Text>
        <View className="food-catalog-search">
          <NordicIcon name="utensils" size={20} ariaLabel="搜索食物" />
          <Input
            value={query}
            maxlength={80}
            confirmType="search"
            placeholder="例如：牛肉、鸡胸肉、oatmeal"
            onConfirm={() => void search()}
            onInput={(event) => setQuery(event.detail.value)}
          />
          <View className="food-catalog-search__action" ariaLabel="搜索" onClick={() => void search()}>
            <Text>{isSearching ? "查询中" : "搜索"}</Text>
          </View>
        </View>
        <View className="food-catalog-page__source-note">
          <Text>支持中文或英文搜索 · 营养数据来自 USDA · 默认按每 100g 展示</Text>
        </View>
        <View className="food-catalog-filters">
          <View className="food-catalog-filters__group">
            <Text className="food-catalog-filters__label">分类</Text>
            <View className="food-catalog-filters__chips">
              {FOOD_CATEGORIES.map((category) => (
                <View
                  className={`food-catalog-filter ${categoryFilter === category ? "food-catalog-filter--active" : ""}`}
                  key={category}
                  onClick={() => setCategoryFilter(category)}
                >
                  <Text>{category}</Text>
                </View>
              ))}
            </View>
          </View>
          <View className="food-catalog-filters__group">
            <Text className="food-catalog-filters__label">标签</Text>
            <View className="food-catalog-filters__chips">
              {FOOD_TAGS.map((tag) => (
                <View
                  className={`food-catalog-filter ${tagFilter === tag ? "food-catalog-filter--active" : ""}`}
                  key={tag}
                  onClick={() => setTagFilter(tag)}
                >
                  <Text>{tag}</Text>
                </View>
              ))}
            </View>
          </View>
        </View>
        {items.length ? (
          <>
            {!hasSearched ? <Text className="food-catalog-page__discovery-title">今日随机推荐 10 种食物</Text> : null}
          <View className="food-catalog-results">
            {visibleItems.map((food) => (
              <View className="food-catalog-item" key={food.id} onClick={() => inspect(food)}>
                {food.imageUrl ? (
                  <Image className="food-catalog-item__image" src={food.imageUrl} mode="aspectFill" />
                ) : (
                  <View className="food-catalog-item__icon"><NordicIcon name="utensils" size={23} ariaLabel="食物" /></View>
                )}
                <View className="food-catalog-item__copy">
                  <Text className="food-catalog-item__name">{food.description}</Text>
                  <Text className="food-catalog-item__meta">{food.brandName || food.category || "USDA 标准食物"}</Text>
                  <View className="food-catalog-item__labels">
                    <Text className="food-catalog-item__category">{getFoodCategory(food)}</Text>
                    {getFoodTags(food).slice(0, 2).map((tag) => <Text className="food-catalog-item__tag" key={tag}>{tag}</Text>)}
                  </View>
                  <View className="food-catalog-item__nutrition">
                    <Text>{numberText(food.caloriesKcalPer100g, " kcal")}</Text>
                    <Text>{numberText(food.proteinGPer100g, "g 蛋白")}</Text>
                    <Text>{numberText(food.carbsGPer100g, "g 碳水")}</Text>
                  </View>
                </View>
                <NordicIcon name="chevron-right" size={20} ariaLabel="选择食物" />
              </View>
            ))}
          </View>
          {!visibleItems.length ? (
            <View className="food-catalog-empty food-catalog-empty--filtered">
              <Text className="food-catalog-empty__title">暂无符合筛选的食物</Text>
              <Text className="food-catalog-empty__copy">可以调整分类或标签，再试一次。</Text>
            </View>
          ) : null}
          </>
        ) : hasSearched && !isSearching ? (
          <View className="food-catalog-empty">
            <NordicIcon name="utensils" size={30} ariaLabel="未找到结果" />
            <Text className="food-catalog-empty__title">暂未找到匹配食物</Text>
            <Text className="food-catalog-empty__copy">可尝试中文或英文食物名、品牌名或更短关键词。</Text>
          </View>
        ) : (
          <View className="food-catalog-empty">
            <NordicIcon name="sparkles" size={30} ariaLabel="食物库提示" />
            <Text className="food-catalog-empty__title">正在为你准备食物库</Text>
            <Text className="food-catalog-empty__copy">也可搜索：牛肉、鸡胸肉、salmon、greek yogurt。</Text>
          </View>
        )}
      </View>
    </PageLayout>
  );
}
