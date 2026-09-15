import { describe, expect, it } from "vitest";
import { DEFAULT_MEAL_GROUP_EXPANDED, createMealGroupStateStorage } from "./meal-group-state";

describe("meal group state storage", () => {
  it("defaults every meal group to expanded", () => {
    const storage = createMealGroupStateStorage({ read: () => null, write: () => undefined });
    expect(storage.load("account-a")).toEqual(DEFAULT_MEAL_GROUP_EXPANDED);
  });

  it("keeps expanded state isolated per account", () => {
    let value: unknown = null;
    const storage = createMealGroupStateStorage({ read: () => value, write: (_, next) => { value = next; } });
    storage.save("account-a", { ...DEFAULT_MEAL_GROUP_EXPANDED, lunch: false });
    storage.save("account-b", { ...DEFAULT_MEAL_GROUP_EXPANDED, dinner: false });

    expect(storage.load("account-a").lunch).toBe(false);
    expect(storage.load("account-a").dinner).toBe(true);
    expect(storage.load("account-b").dinner).toBe(false);
  });
});
