import { Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AppButton } from "../../components/app-button";
import { NordicIcon } from "../../components/nordic-icon";
import { FoodThumbnail } from "../../components/food-thumbnail";
import { getFoodCategory, getFoodTags } from "../../features/food-catalog/food-labels";
import { PageLayout } from "../../layouts/page-layout";
import { useFoodSelectionStore } from "../../stores/food-selection-store";
import { navigateBackOrHome } from "../../utils/navigation";

const nutritionValue = (value: number | null, suffix: string) =>
  value === null ? "—" : `${Math.round(value * 10) / 10}${suffix}`;

export default function FoodDetailPage() {
  const router = useRouter();
  const food = useFoodSelectionStore((state) => state.detailFood);
  const selectFood = useFoodSelectionStore((state) => state.selectFood);
  const fromManualMeal = router.params.mode === "select";
  const returnToCatalog = () => navigateBackOrHome("/pages/food-catalog/index");

  if (!food) {
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

  const tags = getFoodTags(food);
  const nutrition = [
    { label: "热量", value: nutritionValue(food.caloriesKcalPer100g, " kcal") },
    { label: "蛋白质", value: nutritionValue(food.proteinGPer100g, " g") },
    { label: "碳水", value: nutritionValue(food.carbsGPer100g, " g") },
    { label: "脂肪", value: nutritionValue(food.fatGPer100g, " g") },
  ];
  const addToManualMeal = () => {
    selectFood(food);
    void Taro.navigateBack({ delta: 2 });
  };

  return (
    <PageLayout
      title="食物详情"
      showTabs={false}
      hideNavigation
      className="page-layout--food-detail"
    >
      <View className="food-detail-page">
        <View className="food-detail-page__title-row">
          <View className="food-detail-page__back" ariaLabel="返回食物库" onClick={returnToCatalog}>
            <NordicIcon name="back" size={22} ariaLabel="返回食物库" />
          </View>
          <Text>食物详情</Text>
        </View>
        <View className="food-detail-page__hero">
          <FoodThumbnail className="food-detail-page__image" food={food} />
        </View>
        <View className="food-detail-page__identity">
          <Text className="food-detail-page__name">{food.description}</Text>
          <Text className="food-detail-page__source">
            {food.brandName || food.category || "USDA 标准食物"}
          </Text>
          <View className="food-detail-page__labels">
            <Text className="food-detail-page__category">{getFoodCategory(food)}</Text>
            {tags.map((tag) => (
              <Text className="food-detail-page__tag" key={tag}>
                {tag}
              </Text>
            ))}
          </View>
        </View>
        <View className="food-detail-page__section-heading">
          <Text>营养估算</Text>
          <Text>每 100g</Text>
        </View>
        <View className="food-detail-page__nutrition-grid">
          {nutrition.map((item) => (
            <View className="food-detail-page__nutrition-item" key={item.label}>
              <Text>{item.label}</Text>
              <Text>{item.value}</Text>
            </View>
          ))}
        </View>
        <View className="food-detail-page__note">
          <NordicIcon name="check" size={18} ariaLabel="数据来源" />
          <Text>营养信息来自 USDA FoodData Central，适合用作日常饮食估算参考。</Text>
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
