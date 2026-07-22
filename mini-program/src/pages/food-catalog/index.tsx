import { Input, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useState } from "react";
import { searchProductFoodCatalog, type ProductFoodCatalogItem } from "../../api/food-catalog-api";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import { navigateBackOrHome } from "../../utils/navigation";

const numberText = (value: number | null, suffix: string) => value === null ? "—" : `${Math.round(value)}${suffix}`;

export default function FoodCatalogPage() {
  const feedback = useFeedbackStore();
  const selectFood = useFoodSelectionStore((state) => state.selectFood);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ProductFoodCatalogItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

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

  const select = (food: ProductFoodCatalogItem) => {
    selectFood(food);
    feedback.show({ message: "已带回手动记录", tone: "success" });
    Taro.navigateBack();
  };

  return (
    <PageLayout title="标准食物库" showTabs={false} hideNavigation className="page-layout--food-catalog">
      <View className="food-catalog-page">
        <View className="food-catalog-page__title-row">
          <View className="food-catalog-page__back" ariaLabel="返回" onClick={() => navigateBackOrHome("/pages/manual-meal/index")}>
            <NordicIcon name="back" size={22} ariaLabel="返回" />
          </View>
          <Text>标准食物库</Text>
        </View>
        <Text className="food-catalog-page__description">查询 USDA 标准营养数据，选择后自动回填到本餐。</Text>
        <View className="food-catalog-search">
          <NordicIcon name="utensils" size={20} ariaLabel="搜索食物" />
          <Input
            value={query}
            maxlength={80}
            confirmType="search"
            placeholder="例如：chicken breast、oatmeal"
            onConfirm={() => void search()}
            onInput={(event) => setQuery(event.detail.value)}
          />
          <View className="food-catalog-search__action" ariaLabel="搜索" onClick={() => void search()}>
            <Text>{isSearching ? "查询中" : "搜索"}</Text>
          </View>
        </View>
        <View className="food-catalog-page__source-note">
          <Text>营养数据来源：USDA FoodData Central · 默认按每 100g 展示</Text>
        </View>
        {items.length ? (
          <View className="food-catalog-results">
            {items.map((food) => (
              <View className="food-catalog-item" key={food.id} onClick={() => select(food)}>
                <View className="food-catalog-item__icon"><NordicIcon name="utensils" size={23} ariaLabel="食物" /></View>
                <View className="food-catalog-item__copy">
                  <Text className="food-catalog-item__name">{food.description}</Text>
                  <Text className="food-catalog-item__meta">{food.brandName || food.category || "USDA 标准食物"}</Text>
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
        ) : hasSearched && !isSearching ? (
          <View className="food-catalog-empty">
            <NordicIcon name="utensils" size={30} ariaLabel="未找到结果" />
            <Text className="food-catalog-empty__title">暂未找到匹配食物</Text>
            <Text className="food-catalog-empty__copy">可尝试英文食物名、品牌名或更短关键词。</Text>
          </View>
        ) : (
          <View className="food-catalog-empty">
            <NordicIcon name="sparkles" size={30} ariaLabel="食物库提示" />
            <Text className="food-catalog-empty__title">搜索食物，自动带回营养数据</Text>
            <Text className="food-catalog-empty__copy">例如：salmon、banana、greek yogurt。</Text>
          </View>
        )}
      </View>
    </PageLayout>
  );
}
