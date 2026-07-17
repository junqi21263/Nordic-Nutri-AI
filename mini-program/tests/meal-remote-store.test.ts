import { describe, expect, it, vi } from "vitest";
import type { Meal } from "../src/features/meals/domain";
import { createMealStoreWithRepository } from "../src/stores/meal-store";

const today = "2026-07-16";
const remoteMeal: Meal = {
  id: "remote-meal-1",
  date: today,
  time: "12:30",
  title: "鸡胸肉沙拉",
  mealType: "lunch",
  favorite: false,
  imageKey: null,
  insight: "",
  items: [{ id: "item-1", name: "鸡胸肉", amount: "150g", calories: 240, protein: 45, carbs: 0, fat: 4 }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return { promise, resolve };
}

describe("remote meal store", () => {
  it("ignores an older list response after the selected date changes", async () => {
    const firstRequest = deferred<{ meals: Meal[]; hasMore: boolean }>();
    const list = vi.fn().mockReturnValue(firstRequest.promise);
    const store = createMealStoreWithRepository({ list } as never, undefined, today);

    void store.getState().loadRemote();
    store.getState().setSelectedDate("2026-07-17");
    firstRequest.resolve({ meals: [remoteMeal], hasMore: false });
    await Promise.resolve();
    await Promise.resolve();

    expect(store.getState().meals).not.toContainEqual(remoteMeal);
  });

  it("updates visible state from server results after edit and archive", async () => {
    const updatedMeal = { ...remoteMeal, title: "鸡胸肉藜麦沙拉" };
    const store = createMealStoreWithRepository({
      list: vi.fn(),
      update: vi.fn().mockResolvedValue(updatedMeal),
      archive: vi.fn().mockResolvedValue(updatedMeal),
    } as never, [remoteMeal], today);

    await store.getState().updateRemote(remoteMeal.id, {
      title: updatedMeal.title,
      mealType: "lunch",
      recordedAt: `${today}T12:30:00`,
      isFavorite: false,
      items: [{ name: "鸡胸肉", confirmedQuantityG: 150, caloriesPer100G: 160, proteinGPer100G: 30, carbsGPer100G: 0, fatGPer100G: 3 }],
    });
    expect(store.getState().getMealById(remoteMeal.id)?.title).toBe(updatedMeal.title);

    await store.getState().archiveRemote(remoteMeal.id);
    expect(store.getState().getMealById(remoteMeal.id)).toBeUndefined();
  });

  it("reveals the next remote page after it is loaded", async () => {
    const firstPage = Array.from({ length: 12 }, (_, index) => ({ ...remoteMeal, id: `meal-${index}` }));
    const secondPage = [{ ...remoteMeal, id: "meal-12" }];
    const store = createMealStoreWithRepository({
      list: vi.fn()
        .mockResolvedValueOnce({ meals: firstPage, hasMore: true })
        .mockResolvedValueOnce({ meals: secondPage, hasMore: false }),
    } as never, undefined, today);

    await store.getState().loadRemote();
    await store.getState().loadMoreRemote();

    expect(store.getState().filterMeals()).toHaveLength(13);
  });
});
