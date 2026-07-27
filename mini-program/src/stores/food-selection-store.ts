import { create } from "zustand";
import type { ProductFoodCatalogItem } from "../api/food-catalog-api";

interface FoodSelectionStore {
  selectedFood: ProductFoodCatalogItem | null;
  detailFood: ProductFoodCatalogItem | null;
  recentFoods: ProductFoodCatalogItem[];
  selectFood: (food: ProductFoodCatalogItem) => void;
  inspectFood: (food: ProductFoodCatalogItem) => void;
  addRecentFood: (food: ProductFoodCatalogItem) => void;
  consumeSelectedFood: () => ProductFoodCatalogItem | null;
}

export const useFoodSelectionStore = create<FoodSelectionStore>((set, get) => ({
  selectedFood: null,
  detailFood: null,
  recentFoods: [],
  selectFood: (selectedFood) => set({ selectedFood }),
  inspectFood: (detailFood) => set({ detailFood }),
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
