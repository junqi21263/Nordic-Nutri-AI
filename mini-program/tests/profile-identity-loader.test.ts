import { describe, expect, it, vi } from "vitest";
import { createProfileIdentityLoader } from "../src/auth/profile-identity-loader";

describe("profile identity loader", () => {
  it("hydrates the page-facing profile and settings from authenticated server rows", async () => {
    const beginUser = vi.fn();
    const hydrate = vi.fn();
    const loader = createProfileIdentityLoader({
      beginUser,
      hydrate,
      getIdentity: async () => ({
        profile: { nickname: "北欧用户", avatar_path: null },
        settings: { meals_per_day: 4, dietary_pattern: "balanced", food_avoidances: ["花生"], theme: "system", locale: "zh-CN", unit_system: "metric", notification_enabled: true },
      }),
    });

    await loader.load("u1");

    expect(beginUser).toHaveBeenCalledWith("u1");
    expect(hydrate).toHaveBeenCalledWith("u1", { nickname: "北欧用户" }, expect.objectContaining({ mealsPerDay: 4, foodAvoidances: ["花生"] }));
  });
});
