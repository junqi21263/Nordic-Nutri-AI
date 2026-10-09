import type { DietaryPattern, FoodAvoidance, OnboardingDraft } from "./domain";
import type { NordicIconName } from "../../components/nordic-icon";

export interface DietaryPatternOption {
  value: DietaryPattern;
  label: string;
  description: string;
  icon: NordicIconName;
}

export interface FoodAvoidanceOption {
  value: FoodAvoidance;
  label: string;
}

export interface MealCountOption {
  value: OnboardingDraft["mealsPerDay"];
  label: string;
}

// Kept as data rather than page markup so a future admin setting can return this same shape.
export const dietaryPatternOptions: DietaryPatternOption[] = [
  { value: "none", label: "无特殊", description: "均衡饮食", icon: "food-bowl" },
  { value: "vegetarian", label: "素食为主", description: "优先植物蛋白", icon: "food-bean" },
  { value: "vegan", label: "纯素饮食", description: "不含动物性食物", icon: "food-carrot" },
  { value: "pescatarian", label: "鱼素饮食", description: "以鱼类与植物为主", icon: "food-fish" },
  { value: "low_carb", label: "低碳饮食", description: "适度控制碳水", icon: "carbs" },
  { value: "keto", label: "生酮饮食", description: "高脂低碳结构", icon: "food-oil" },
  { value: "mediterranean", label: "地中海饮食", description: "橄榄油与全谷物", icon: "food-oil" },
  { value: "halal", label: "清真饮食", description: "遵循清真饮食习惯", icon: "utensils" },
];

export const foodAvoidanceOptions: FoodAvoidanceOption[] = [
  { value: "dairy", label: "乳制品" },
  { value: "nuts", label: "坚果" },
  { value: "seafood", label: "海鲜" },
  { value: "beef", label: "牛肉" },
  { value: "eggs", label: "鸡蛋" },
  { value: "gluten", label: "麸质" },
  { value: "pork", label: "猪肉" },
  { value: "soy", label: "大豆" },
  { value: "spicy", label: "辛辣食物" },
];

export const mealCountOptions: MealCountOption[] = [
  { value: "2", label: "2 餐" },
  { value: "3", label: "3 餐" },
  { value: "4", label: "4 餐" },
  { value: "5", label: "5 餐" },
];
