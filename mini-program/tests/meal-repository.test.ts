import { describe, expect, it, vi } from "vitest";
import { createMealRepository } from "../src/repositories/meal-repository";

const response = {
  meal: {
    id: "meal-1", name: "鸡胸肉沙拉", meal_type: "lunch", recorded_at: "2026-07-16T04:30:00.000Z",
    is_favorite: false, calories_kcal: 320, protein_g: 38, carbs_g: 18, fat_g: 10,
  },
  items: [{ id: "item-1", name: "鸡胸肉", confirmed_quantity_g: 150, calories_per_100g: 160, protein_g_per_100g: 30, carbs_g_per_100g: 0, fat_g_per_100g: 3 }],
};

describe("meal repository", () => {
  it("creates a manual meal through the atomic RPC and maps server totals", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const repository = createMealRepository({ rpc });

    const meal = await repository.create({
      clientRequestId: "00000000-0000-4000-8000-000000000001",
      title: "鸡胸肉沙拉", mealType: "lunch", recordedAt: "2026-07-16T04:30:00.000Z", isFavorite: false,
      items: [{ name: "鸡胸肉", confirmedQuantityG: 150, caloriesPer100G: 160, proteinGPer100G: 30, carbsGPer100G: 0, fatGPer100G: 3 }],
    });

    expect(rpc).toHaveBeenCalledWith("save_meal_atomic", expect.objectContaining({ p_input: expect.objectContaining({ clientRequestId: "00000000-0000-4000-8000-000000000001" }) }));
    expect(meal.id).toBe("meal-1");
    expect(meal.items[0]?.calories).toBe(240);
  });

  it("uses the update RPC for a multi-item edit", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const repository = createMealRepository({ rpc });

    await repository.update("meal-1", {
      title: "鸡胸肉沙拉", mealType: "lunch", recordedAt: "2026-07-16T04:30:00.000Z", isFavorite: false,
      items: [{ name: "鸡胸肉", confirmedQuantityG: 150, caloriesPer100G: 160, proteinGPer100G: 30, carbsGPer100G: 0, fatGPer100G: 3 }],
    });

    expect(rpc).toHaveBeenCalledWith("update_meal_atomic", expect.objectContaining({ p_input: expect.objectContaining({ mealId: "meal-1" }) }));
  });
});
