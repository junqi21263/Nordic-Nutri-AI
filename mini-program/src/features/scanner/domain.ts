import {
  getMealNutrition,
  getMealScore,
  type Meal,
  type MealItem,
  type MealType,
} from "../meals/domain";

export interface ScannerMealFixture {
  id: string;
  analysisId?: string;
  portionMultiplier?: number;
  title: string;
  evaluation?: string;
  imageUrl?: string | null;
  imagePath?: string | null;
  nutritionSource?: string;
  mealType: MealType;
  imageKey: "bowl" | "salmon" | "oats";
  confidence: number;
  items: MealItem[];
  insight: string;
}

export interface AdjustedAnalysis extends ScannerMealFixture {
  multiplier: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  score: "A" | "B" | "C";
}

const item = (
  id: string,
  name: string,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
): MealItem => ({ id, name, amount: "1 份", calories, protein, carbs, fat });

const fixtureSeeds: Array<Omit<ScannerMealFixture, "items"> & { items: MealItem[] }> = [
  {
    id: "scan-chicken-rice",
    title: "香煎鸡胸米饭碗",
    mealType: "lunch",
    imageKey: "bowl",
    confidence: 98,
    insight: "高蛋白、碳水均衡，适合作为训练后的餐食。",
    items: [
      item("chicken", "鸡胸肉", 248, 46, 0, 5),
      item("rice", "白米饭", 232, 5, 51, 1),
      item("broccoli", "西兰花", 55, 4, 10, 0),
    ],
  },
  {
    id: "scan-salmon-bowl",
    title: "三文鱼能量碗",
    mealType: "dinner",
    imageKey: "salmon",
    confidence: 96,
    insight: "优质脂肪充足，晚间保持清淡即可。",
    items: [item("salmon", "三文鱼", 374, 40, 0, 24), item("potato", "烤土豆", 208, 5, 47, 0)],
  },
  {
    id: "scan-steak",
    title: "牛排与时蔬",
    mealType: "dinner",
    imageKey: "bowl",
    confidence: 95,
    insight: "蛋白质很扎实，注意酱汁中的额外脂肪。",
    items: [item("beef", "牛排", 390, 48, 0, 22), item("vegetables", "烤时蔬", 95, 4, 14, 3)],
  },
  {
    id: "scan-avocado-toast",
    title: "牛油果鸡蛋吐司",
    mealType: "breakfast",
    imageKey: "oats",
    confidence: 94,
    insight: "饱腹感很好，适合节奏舒缓的早晨。",
    items: [
      item("toast", "全麦吐司", 180, 8, 32, 2),
      item("avocado", "牛油果", 160, 2, 8, 15),
      item("egg", "鸡蛋", 140, 12, 1, 10),
    ],
  },
  {
    id: "scan-oatmeal",
    title: "莓果燕麦碗",
    mealType: "breakfast",
    imageKey: "oats",
    confidence: 97,
    insight: "碳水稳定，补一份蛋白质会更完整。",
    items: [
      item("oats", "燕麦", 228, 8, 40, 4),
      item("berries", "莓果", 50, 1, 11, 0),
      item("skyr", "Skyr", 95, 17, 6, 0),
    ],
  },
  {
    id: "scan-greek-yogurt",
    title: "希腊酸奶坚果杯",
    mealType: "snack",
    imageKey: "oats",
    confidence: 93,
    insight: "便捷高蛋白加餐，坚果份量需留意。",
    items: [item("yogurt", "希腊酸奶", 160, 20, 8, 4), item("nuts", "杏仁", 120, 4, 4, 10)],
  },
  {
    id: "scan-turkey-salad",
    title: "火鸡藜麦沙拉",
    mealType: "lunch",
    imageKey: "bowl",
    confidence: 95,
    insight: "纤维与蛋白质配合得很均衡。",
    items: [
      item("turkey", "火鸡胸", 210, 40, 0, 4),
      item("quinoa", "藜麦", 192, 7, 34, 3),
      item("avocado", "牛油果", 80, 1, 4, 7),
    ],
  },
  {
    id: "scan-tofu-noodles",
    title: "豆腐荞麦面",
    mealType: "lunch",
    imageKey: "bowl",
    confidence: 91,
    insight: "植物蛋白和主食都有，训练日可适度加量。",
    items: [item("tofu", "北豆腐", 180, 20, 6, 10), item("noodles", "荞麦面", 280, 10, 55, 2)],
  },
  {
    id: "scan-tuna-sandwich",
    title: "金枪鱼全麦三明治",
    mealType: "lunch",
    imageKey: "oats",
    confidence: 92,
    insight: "适合忙碌日的快速午餐。",
    items: [item("tuna", "金枪鱼", 160, 31, 0, 2), item("bread", "全麦面包", 210, 10, 38, 3)],
  },
  {
    id: "scan-shrimp-rice",
    title: "鲜虾糙米碗",
    mealType: "dinner",
    imageKey: "bowl",
    confidence: 96,
    insight: "低脂高蛋白，晚餐选择很轻盈。",
    items: [item("shrimp", "鲜虾", 190, 36, 1, 2), item("brown-rice", "糙米饭", 220, 5, 45, 2)],
  },
  {
    id: "scan-chicken-wrap",
    title: "鸡肉蔬菜卷",
    mealType: "lunch",
    imageKey: "oats",
    confidence: 90,
    insight: "蔬菜比例不错，注意饼皮和酱料热量。",
    items: [item("chicken", "鸡肉", 220, 38, 0, 5), item("wrap", "全麦卷饼", 200, 7, 36, 4)],
  },
  {
    id: "scan-pasta",
    title: "番茄牛肉意面",
    mealType: "dinner",
    imageKey: "bowl",
    confidence: 94,
    insight: "训练日可提供充足糖原补给。",
    items: [item("beef", "瘦牛肉", 250, 34, 0, 12), item("pasta", "意面", 310, 11, 62, 2)],
  },
  {
    id: "scan-egg-white",
    title: "蛋白蔬菜欧姆蛋",
    mealType: "breakfast",
    imageKey: "oats",
    confidence: 92,
    insight: "蛋白质优秀，搭配一份水果更均衡。",
    items: [item("egg-white", "蛋白", 110, 23, 2, 0), item("vegetables", "彩椒菠菜", 55, 3, 9, 1)],
  },
  {
    id: "scan-protein-pancake",
    title: "蛋白松饼",
    mealType: "breakfast",
    imageKey: "oats",
    confidence: 89,
    insight: "甜点感早餐也能保留蛋白质。",
    items: [item("pancake", "燕麦松饼", 260, 18, 40, 6), item("yogurt", "酸奶", 90, 12, 5, 1)],
  },
  {
    id: "scan-cottage",
    title: "茅屋奶酪水果盘",
    mealType: "snack",
    imageKey: "oats",
    confidence: 90,
    insight: "轻盈加餐，适合补足下午蛋白。",
    items: [item("cottage", "茅屋奶酪", 180, 25, 8, 5), item("fruit", "奇异果", 60, 1, 14, 0)],
  },
  {
    id: "scan-edamame",
    title: "毛豆鸡蛋小食",
    mealType: "snack",
    imageKey: "oats",
    confidence: 88,
    insight: "简单的植物蛋白与优质脂肪组合。",
    items: [item("edamame", "毛豆", 170, 16, 14, 7), item("egg", "鸡蛋", 70, 6, 1, 5)],
  },
  {
    id: "scan-cod",
    title: "鳕鱼蔬菜盘",
    mealType: "dinner",
    imageKey: "salmon",
    confidence: 93,
    insight: "低脂蛋白很突出，适合热量接近目标时。",
    items: [item("cod", "鳕鱼", 190, 42, 0, 2), item("vegetables", "烤蔬菜", 120, 5, 20, 3)],
  },
  {
    id: "scan-lentil",
    title: "扁豆藜麦碗",
    mealType: "lunch",
    imageKey: "bowl",
    confidence: 89,
    insight: "植物来源丰富，蛋白质略低时可加酸奶。",
    items: [item("lentil", "扁豆", 230, 18, 40, 1), item("quinoa", "藜麦", 192, 7, 34, 3)],
  },
  {
    id: "scan-burrito",
    title: "牛肉豆子墨西哥碗",
    mealType: "dinner",
    imageKey: "bowl",
    confidence: 92,
    insight: "能量充足，适合强度较高的训练日。",
    items: [
      item("beef", "瘦牛肉", 250, 34, 0, 12),
      item("beans", "黑豆", 180, 12, 32, 1),
      item("rice", "米饭", 174, 4, 38, 0),
    ],
  },
  {
    id: "scan-smoothie",
    title: "蓝莓蛋白奶昔",
    mealType: "snack",
    imageKey: "oats",
    confidence: 91,
    insight: "流动加餐方便，但不应替代正餐蔬菜。",
    items: [
      item("whey", "乳清蛋白", 120, 24, 3, 2),
      item("blueberry", "蓝莓", 60, 1, 14, 0),
      item("milk", "牛奶", 110, 8, 12, 3),
    ],
  },
];

export const createScannerFixtures = (): ScannerMealFixture[] =>
  fixtureSeeds.map((meal) => ({ ...meal, items: meal.items.map((entry) => ({ ...entry })) }));

export function pickScannerCandidates(
  fixtures: ScannerMealFixture[],
  random = Math.random,
): ScannerMealFixture[] {
  const count = 5 + Math.floor(random() * 6);
  const indexed = fixtures.map((meal, index) => ({
    meal,
    order: (index + random()) % fixtures.length,
  }));
  return indexed
    .sort((left, right) => left.order - right.order)
    .slice(0, Math.min(count, fixtures.length))
    .map(({ meal }) => meal);
}

const scale = (value: number, multiplier: number) => Math.round(value * multiplier);
export function getAdjustedAnalysis(
  meal: ScannerMealFixture,
  multiplier: number,
): AdjustedAnalysis {
  const normalized = Math.min(2, Math.max(0.25, multiplier));
  const items = meal.items.map((entry) => ({
    ...entry,
    calories: scale(entry.calories, normalized),
    protein: scale(entry.protein, normalized),
    carbs: scale(entry.carbs, normalized),
    fat: scale(entry.fat, normalized),
  }));
  const nutrition = getMealNutrition({
    ...meal,
    id: meal.id,
    date: "",
    time: "",
    favorite: false,
    items,
  } as Meal);
  const score = getMealScore({
    ...meal,
    id: meal.id,
    date: "",
    time: "",
    favorite: false,
    items,
  } as Meal);
  return { ...meal, items, multiplier: normalized, ...nutrition, score };
}

export function createMealFromAnalysis(
  meal: ScannerMealFixture,
  multiplier: number,
  date: string,
  time: string,
): Omit<Meal, "id"> {
  const adjusted = getAdjustedAnalysis(meal, multiplier);
  return {
    date,
    time,
    title: meal.title,
    mealType: meal.mealType,
    favorite: false,
    imageKey: meal.imageKey,
    imageUrl: meal.imagePath || meal.imageUrl || null,
    portionMultiplier: Math.min(2, Math.max(0.25, multiplier)),
    items: adjusted.items,
    insight: meal.insight,
  };
}
