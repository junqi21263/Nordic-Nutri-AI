import { describe, expect, it } from "vitest";
import { createProfileStore } from "../src/stores/profile-store";

describe("profile store identity boundary", () => {
  it("discards the previous user's preview data before hydrating a new authenticated user", () => {
    const store = createProfileStore();
    store.getState().hydrate("u1", { nickname: "北欧用户", weight: 68 }, { mealsPerDay: 4 });

    store.getState().beginUser("u2");

    expect(store.getState().userId).toBe("u2");
    expect(store.getState().dataStatus).toBe("loading");
    expect(store.getState().profile.nickname).toBe("Lewis");
    expect(store.getState().settings.mealsPerDay).toBe(3);
  });
});
