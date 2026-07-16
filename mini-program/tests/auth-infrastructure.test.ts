import { describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/supabase-client", () => ({
  getSupabaseClient: vi.fn(),
}));

import { withAuthRefresh } from "../src/api/backend-client";

describe("authentication request infrastructure", () => {
  it("refreshes and retries exactly once after an unauthorized response", async () => {
    let attempts = 0;
    let refreshes = 0;

    const result = await withAuthRefresh(
      async () => {
        attempts += 1;
        if (attempts === 1) throw { status: 401 };
        return "ok";
      },
      async () => {
        refreshes += 1;
      },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(refreshes).toBe(1);
  });

  it("does not refresh or retry a non-authentication failure", async () => {
    let refreshes = 0;
    const networkError = { status: 503 };

    await expect(
      withAuthRefresh(
        async () => {
          throw networkError;
        },
        async () => {
          refreshes += 1;
        },
      ),
    ).rejects.toBe(networkError);

    expect(refreshes).toBe(0);
  });
});
