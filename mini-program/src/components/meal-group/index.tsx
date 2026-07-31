import { Image, Text, View } from "@tarojs/components";
import { getFoodVisualFallback } from "../../features/food-catalog/food-visuals";
import { getMealNutrition, type Meal, type MealType } from "../../features/meals/domain";
import { NordicIcon } from "../nordic-icon";
import bowlImage from "../../assets/meal-bowl.svg";
import oatsImage from "../../assets/meal-oats.svg";
import salmonImage from "../../assets/meal-salmon.svg";

const labels: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};
const imageByKey = { bowl: bowlImage, oats: oatsImage, salmon: salmonImage };

function mealThumbSrc(meal: Meal) {
  if (meal.imageUrl) return meal.imageUrl;
  if (meal.imageKey) return imageByKey[meal.imageKey];
  return null;
}

export interface MealGroupProps {
  mealType: MealType;
  meals: Meal[];
  onSelect: (meal: Meal) => void;
  onAdd: (mealType: MealType) => void;
}
export function MealGroup({ mealType, meals, onSelect, onAdd }: MealGroupProps) {
  return (
    <View className="meal-group">
      <View className="meal-group__head">
        <Text className="section-title__title">{labels[mealType]}</Text>
        <Text className="meal-group__count">{meals.length} 餐</Text>
      </View>
      {meals.length === 0 ? (
        <View className="meal-group__empty" onClick={() => onAdd(mealType)}>
          <Text>＋</Text>
          <Text>新增{labels[mealType]}</Text>
        </View>
      ) : (
        meals.map((meal) => {
          const nutrition = getMealNutrition(meal);
          const thumb = mealThumbSrc(meal);
          const fallback = getFoodVisualFallback({ description: meal.title });
          return (
            <View className="meal-group__item" key={meal.id} onClick={() => onSelect(meal)}>
              <View
                className={
                  thumb
                    ? `meal-group__image meal-group__image--${meal.imageKey ?? "photo"}`
                    : `meal-group__image meal-group__image--fallback meal-group__image--${fallback.tone}`
                }
              >
                {thumb ? (
                  <Image className="meal-group__image-asset" src={thumb} mode="aspectFill" />
                ) : (
                  <NordicIcon name={fallback.icon} size={28} ariaLabel={meal.title} />
                )}
              </View>
              <View className="meal-group__content">
                <Text className="meal-group__title">{meal.title}</Text>
                <Text className="meal-group__meta">
                  {meal.time} · {nutrition.protein}g 蛋白质
                </Text>
              </View>
              <View className="meal-group__right">
                <Text className="meal-group__kcal">{nutrition.calories} kcal</Text>
                <NordicIcon name="pencil" size={16} ariaLabel="编辑餐次" />
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
