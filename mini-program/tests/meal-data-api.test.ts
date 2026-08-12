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
        portionMultiplier: 0.75,
        insight: "蛋白质充足，下一餐可补蔬菜。",
        items: [
          {
            id: "item-1",
            name: "鸡胸肉",
            quantityG: 150,
            caloriesPer100g: 133,
            proteinPer100g: 24,
            carbsPer100g: 0,
            fatPer100g: 3,
            foodId: "food-1",
            imageUrl: "https://cdn.example.com/chicken.jpg",
          },
        ],
      }),
    ).toMatchObject({
      id: "meal-1",
      title: "鸡胸肉沙拉",
      mealType: "lunch",
      favorite: true,
      portionMultiplier: 0.75,
      insight: "蛋白质充足，下一餐可补蔬菜。",
      items: [{
        id: "item-1",
        amount: "150g",
        calories: 200,
        protein: 36,
        foodId: "food-1",
        imageUrl: "https://cdn.example.com/chicken.jpg",
      }],
    });
  });
});
