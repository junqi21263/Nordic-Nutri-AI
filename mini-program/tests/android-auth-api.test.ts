import { describe, expect, it, vi } from "vitest";
import { createAndroidAuthApi, toAppSession } from "../src/api/android-auth-api";

describe("Android auth API refresh sessions", () => {
  it("exposes refresh and logout without leaking tokens into URL parameters", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const api = createAndroidAuthApi({ request });

    await api.refresh("refresh-1");
    await api.logout("refresh-2");

    expect(request).toHaveBeenNthCalledWith(1, "/auth/refresh", { refreshToken: "refresh-1" });
    expect(request).toHaveBeenNthCalledWith(2, "/auth/logout", { refreshToken: "refresh-2" });
  });

  it("maps both access and refresh credentials into the app session", () => {
    expect(toAppSession({
      user: { id: "user-1" },
      session: {
        accessToken: "access-1",
        expiresIn: 604800,
        refreshToken: "refresh-1",
        refreshExpiresIn: 2592000,
      },
    })).toEqual({
      user: { id: "user-1" },
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
  });
});
