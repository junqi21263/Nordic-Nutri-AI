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

  it("reads active meals for one date with item rows and a page range", async () => {
    const range = vi.fn().mockResolvedValue({ data: [response.meal], error: null });
    const order = vi.fn().mockReturnValue({ range });
    const lt = vi.fn().mockReturnValue({ order });
    const gte = vi.fn().mockReturnValue({ lt });
    const itemsIn = vi.fn().mockResolvedValue({ data: response.items, error: null });
    const client = {
      rpc: vi.fn(),
      from: vi.fn((table: string) =>
        table === "active_meal_records"
          ? { select: vi.fn(() => ({ gte })) }
          : { select: vi.fn(() => ({ in: itemsIn })) },
      ),
    };

    const result = await createMealRepository(client).list({
      date: "2026-07-16",
      offset: 12,
      limit: 12,
    });

    expect(client.from).toHaveBeenCalledWith("active_meal_records");
    expect(range).toHaveBeenCalledWith(12, 23);
    expect(client.from).toHaveBeenCalledWith("meal_items");
    expect(result.meals).toMatchObject([{ id: "meal-1", title: "鸡胸肉沙拉" }]);
  });

  it("archives and restores only the requested meal", async () => {
    const single = vi.fn().mockResolvedValue({ data: response.meal, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const itemsIn = vi.fn().mockResolvedValue({ data: response.items, error: null });
    const client = {
      rpc: vi.fn(),
      from: vi.fn((table: string) =>
        table === "meal_records"
          ? { update }
          : { select: vi.fn(() => ({ in: itemsIn })) },
      ),
    };
    const repository = createMealRepository(client);

    await repository.archive("meal-1");
    await repository.restore("meal-1");

    expect(client.from).toHaveBeenNthCalledWith(1, "meal_records");
    expect(update).toHaveBeenNthCalledWith(1, expect.objectContaining({ deleted_at: expect.any(String) }));
    expect(update).toHaveBeenNthCalledWith(2, { deleted_at: null });
    expect(eq).toHaveBeenCalledWith("id", "meal-1");
  });
});
