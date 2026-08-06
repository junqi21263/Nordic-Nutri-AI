import { create } from "zustand";
import type { ProductFoodCatalogItem } from "../api/food-catalog-api";

interface FoodSelectionStore {
  selectedFood: ProductFoodCatalogItem | null;
  detailFood: ProductFoodCatalogItem | null;
  /** Ordered siblings for left/right swipe on the detail page. */
  detailQueue: ProductFoodCatalogItem[];
  recentFoods: ProductFoodCatalogItem[];
  selectFood: (food: ProductFoodCatalogItem) => void;
  inspectFood: (food: ProductFoodCatalogItem, queue?: ProductFoodCatalogItem[]) => void;
  addRecentFood: (food: ProductFoodCatalogItem) => void;
  consumeSelectedFood: () => ProductFoodCatalogItem | null;
}

function uniqueQueue(
  food: ProductFoodCatalogItem,
  queue?: ProductFoodCatalogItem[],
): ProductFoodCatalogItem[] {
  const list = Array.isArray(queue) && queue.length > 0 ? queue : [food];
  const seen = new Set<string>();
  const next: ProductFoodCatalogItem[] = [];
  for (const item of list) {
    if (!item?.id || seen.has(item.id)) continue;
    seen.add(item.id);
    next.push(item);
  }
  if (!seen.has(food.id)) next.unshift(food);
  return next;
}

export const useFoodSelectionStore = create<FoodSelectionStore>((set, get) => ({
  selectedFood: null,
  detailFood: null,
  detailQueue: [],
  recentFoods: [],
  selectFood: (selectedFood) => set({ selectedFood }),
  inspectFood: (detailFood, queue) =>
    set({ detailFood, detailQueue: uniqueQueue(detailFood, queue) }),
  addRecentFood: (food) =>
    set((state) => ({
      recentFoods: [
        food,
        ...state.recentFoods.filter((item) => item.id !== food.id),
      ].slice(0, 6),
    })),
  consumeSelectedFood: () => {
    const selectedFood = get().selectedFood;
    set({ selectedFood: null });
    return selectedFood;
  },
}));
