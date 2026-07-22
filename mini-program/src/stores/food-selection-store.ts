import { create } from "zustand";
import type { ProductFoodCatalogItem } from "../api/food-catalog-api";

interface FoodSelectionStore {
  selectedFood: ProductFoodCatalogItem | null;
  selectFood: (food: ProductFoodCatalogItem) => void;
  consumeSelectedFood: () => ProductFoodCatalogItem | null;
}

export const useFoodSelectionStore = create<FoodSelectionStore>((set, get) => ({
  selectedFood: null,
  selectFood: (selectedFood) => set({ selectedFood }),
  consumeSelectedFood: () => {
    const selectedFood = get().selectedFood;
    set({ selectedFood: null });
    return selectedFood;
  },
}));
