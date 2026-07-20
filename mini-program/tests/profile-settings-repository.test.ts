import { describe, expect, it, vi } from "vitest";
import { createProfileRepository } from "../src/repositories/profile-repository";

function createClient(update: ReturnType<typeof vi.fn>) {
  return {
    from: vi.fn(() => ({
      update: (payload: unknown) => {
        update(payload);
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { id: "u1", ...(payload as object) }, error: null }) }) }) };
      },
    })),
  };
}

describe("profile and settings repository", () => {
  it("updates only allowed profile columns and returns the server row", async () => {
    const update = vi.fn();
    const repository = createProfileRepository(createClient(update));

    const profile = await repository.updateProfile("u1", { nickname: "北欧用户", timezone: "Asia/Shanghai" });

    expect(update).toHaveBeenCalledWith({ nickname: "北欧用户", timezone: "Asia/Shanghai" });
    expect(profile.nickname).toBe("北欧用户");
  });

  it("rejects invalid settings before sending a request", async () => {
    const update = vi.fn();
    const repository = createProfileRepository(createClient(update));

    await expect(repository.updateSettings("u1", { mealsPerDay: 6 })).rejects.toMatchObject({ code: "VALIDATION" });

    expect(update).not.toHaveBeenCalled();
  });

  it("loads profile and settings separately for the authenticated user", async () => {
    const select = vi.fn((columns: string) => ({
      eq: (column: string, value: string) => ({
        single: async () => ({ data: { id: value, columns }, error: null }),
      }),
    }));
    const client = {
      from: vi.fn(() => ({ select })),
    };
    const repository = createProfileRepository(client);

    const identity = await repository.getIdentity("u1");

    expect(client.from).toHaveBeenNthCalledWith(1, "profiles");
    expect(client.from).toHaveBeenNthCalledWith(2, "user_settings");
    expect(identity.profile.id).toBe("u1");
    expect(identity.settings.id).toBe("u1");
  });
});
