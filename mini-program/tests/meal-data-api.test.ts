import { describe, expect, it } from "vitest";
import { mapProductMeal } from "../src/features/meals/product-meal-mapper";

describe("meal data API mapping", () => {
  it("maps a server meal to the existing page domain without changing UI fields", () => {
    expect(
      mapProductMeal({
        id: "meal-1",
        mealType: "lunch",
        name: "鸡胸肉沙拉",
        recordedAt: "2026-07-20T04:00:00.000Z",
        isFavorite: true,
        items: [
          {
            id: "item-1",
            name: "鸡胸肉",
            quantityG: 150,
            caloriesPer100g: 133,
            proteinPer100g: 24,
            carbsPer100g: 0,
            fatPer100g: 3,
          },
        ],
      }),
    ).toMatchObject({
      id: "meal-1",
      title: "鸡胸肉沙拉",
      mealType: "lunch",
      favorite: true,
      items: [{ id: "item-1", amount: "150g", calories: 200, protein: 36 }],
    });
  });
});
