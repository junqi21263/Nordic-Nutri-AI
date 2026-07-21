import { Image, Text, View } from "@tarojs/components";
import Taro, { useRouter } from "@tarojs/taro";
import { AIInsightCard } from "../../components/ai-insight-card";
import { AppButton } from "../../components/app-button";
import { AppCard } from "../../components/app-card";
import { ErrorState } from "../../components/error-state";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { useMealStore } from "../../stores/meal-store";
import mealBowlImage from "../../assets/meal-bowl.svg";
import mealOatsImage from "../../assets/meal-oats.svg";
import mealSalmonImage from "../../assets/meal-salmon.svg";

const imagesByIngredientId: Record<string, string> = {
  oats: mealOatsImage,
  berries: mealOatsImage,
  skyr: mealOatsImage,
  chicken: mealBowlImage,
  rice: mealBowlImage,
  vegetables: mealBowlImage,
  salmon: mealSalmonImage,
  potato: mealSalmonImage,
  greens: mealSalmonImage,
  banana: mealBowlImage,
  whey: mealBowlImage,
  turkey: mealBowlImage,
  quinoa: mealBowlImage,
};

export default function IngredientDetailPage() {
  const router = useRouter();
  const store = useMealStore();
  const meal = store.getMealById(router.params.mealId);
  const item = meal?.items.find((entry) => entry.id === router.params.itemId);
  const returnToMeal = () => {
    if (meal) {
      Taro.redirectTo({ url: `/pages/meal-detail/index?id=${meal.id}` });
      return;
    }
    Taro.switchTab({ url: "/pages/meal-records/index" });
  };

  if (!meal || !item) {
    return (
      <PageLayout
        title="食材详情"
        showTabs={false}
        hideNavigation
        className="page-layout--ingredient-detail"
      >
        <ErrorState title="食材不存在" description="这条食材记录可能已被删除，或链接已经失效。" />
        <AppButton
          size="large"
          onClick={() => Taro.switchTab({ url: "/pages/meal-records/index" })}
        >
          返回饮食记录
        </AppButton>
      </PageLayout>
    );
  }

  const macros = [
    { icon: "protein" as const, label: "蛋白质", value: item.protein },
    { icon: "carbs" as const, label: "碳水", value: item.carbs },
    { icon: "fat" as const, label: "脂肪", value: item.fat },
  ];
  const insight = `${item.name}在这餐中提供 ${item.protein}g 蛋白质、${item.carbs}g 碳水和 ${item.fat}g 脂肪，可结合全天目标灵活搭配。`;

  return (
    <PageLayout
      title="食材详情"
      showTabs={false}
      hideNavigation
      className="page-layout--ingredient-detail"
    >
      <View className="ingredient-detail-page">
        <View className="ingredient-detail-page__page-title">
          <View
            className="ingredient-detail-page__back"
            ariaLabel="返回餐食详情"
            onClick={returnToMeal}
          >
            <NordicIcon name="back" size={24} ariaLabel="返回餐食详情" />
          </View>
          <Text>食材详情</Text>
        </View>
        <View className="ingredient-detail-page__heading">
          <Text className="ingredient-detail-page__eyebrow">本餐食材</Text>
          <Text className="ingredient-detail-page__title">{item.name}</Text>
          <Text>
            来自「{meal.title}」· {meal.time}
          </Text>
        </View>
        <AppCard tone="beige" className="ingredient-detail-page__hero">
          <Image
            className="ingredient-detail-page__image"
            mode="aspectFill"
            src={imagesByIngredientId[item.id] ?? mealBowlImage}
          />
          <View className="ingredient-detail-page__hero-copy">
            <Text className="ingredient-detail-page__amount">食用份量 · {item.amount}</Text>
            <Text className="ingredient-detail-page__calories">
              {item.calories}
              <Text> kcal</Text>
            </Text>
            <Text className="ingredient-detail-page__amount">已计入本餐营养</Text>
          </View>
        </AppCard>
        <AppCard>
          <Text className="ingredient-detail-page__section-title">营养构成</Text>
          <View className="ingredient-detail-page__macro-grid">
            {macros.map((macro) => (
              <View className="ingredient-detail-page__macro" key={macro.label}>
                <View className="ingredient-detail-page__macro-head">
                  <NordicIcon name={macro.icon} size={18} ariaLabel={macro.label} />
                  <Text>{macro.label}</Text>
                </View>
                <Text>{macro.value}g</Text>
              </View>
            ))}
          </View>
        </AppCard>
        <AIInsightCard label="食材建议" content={insight} />
        <AppButton size="large" onClick={returnToMeal}>
          返回餐食详情
        </AppButton>
      </View>
    </PageLayout>
  );
}
