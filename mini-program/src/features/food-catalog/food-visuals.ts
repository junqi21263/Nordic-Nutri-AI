import mealBowlImage from "../../assets/meal-bowl.svg";
import mealOatsImage from "../../assets/meal-oats.svg";
import mealSalmonImage from "../../assets/meal-salmon.svg";

type FoodVisualInput = {
  description: string;
  imageUrl: string | null;
};

function fallbackFoodImage(description: string) {
  const normalized = description.toLowerCase();
  if (/(salmon|tuna|fish|shrimp|prawn|crab|seafood|cod)/.test(normalized)) return mealSalmonImage;
  if (
    /(rice|oat|oatmeal|bread|pasta|noodle|potato|grain|cereal|tortilla|apple|banana|avocado|berry|fruit|vegetable|broccoli)/.test(
      normalized,
    )
  )
    return mealOatsImage;
  return mealBowlImage;
}

export function resolveFoodVisual(food: FoodVisualInput) {
  return food.imageUrl?.trim() || fallbackFoodImage(food.description);
}

export function getFoodVisualFallback(food: FoodVisualInput) {
  return fallbackFoodImage(food.description);
}
