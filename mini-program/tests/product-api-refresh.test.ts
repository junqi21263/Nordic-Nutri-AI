import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../src/auth/auth-store";

const productTransport = vi.fn();
const refreshSession = vi.fn();
const clearInvalidSession = vi.fn();

vi.mock("../src/platform/product-transport", () => ({ productTransport }));
vi.mock("../src/auth/session-manager", () => ({ refreshSession, clearInvalidSession }));
vi.mock("../src/features/account-cancellation/clear-local-state", () => ({ clearProductLocalState: vi.fn() }));

describe("product API session renewal", () => {
  beforeEach(() => {
    productTransport.mockReset();
    refreshSession.mockReset();
    clearInvalidSession.mockReset();
    useAuthStore.getState().setSession({ user: { id: "user-1" }, accessToken: "access-old", refreshToken: "refresh-old" });
  });

  it("refreshes after 401 and retries the original request once", async () => {
    productTransport
      .mockResolvedValueOnce({ statusCode: 401, data: { code: "UNAUTHORIZED" } })
      .mockResolvedValueOnce({ statusCode: 200, data: { ok: true } });
    refreshSession.mockImplementation(async () => {
      const session = { user: { id: "user-1" }, accessToken: "access-new", refreshToken: "refresh-new" };
      useAuthStore.getState().setSession(session);
      return session;
    });
    const { requestProductApi } = await import("../src/api/product-api-client");

    await expect(requestProductApi<{ ok: boolean }>("/data/me", {
      method: "GET",
      fallbackMessage: "failed",
    })).resolves.toEqual({ ok: true });

    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(productTransport).toHaveBeenCalledTimes(2);
    expect(productTransport.mock.calls[1][0].header.authorization).toBe("Bearer access-new");
    expect(clearInvalidSession).not.toHaveBeenCalled();
  });

  it("clears an invalid session after one unsuccessful refresh", async () => {
    productTransport.mockResolvedValue({ statusCode: 401, data: { code: "UNAUTHORIZED" } });
    refreshSession.mockResolvedValue(null);
    const { requestProductApi } = await import("../src/api/product-api-client");

    await expect(requestProductApi("/data/me", { method: "GET", fallbackMessage: "failed" }))
      .rejects.toMatchObject({ name: "UNAUTHORIZED" });
    expect(productTransport).toHaveBeenCalledTimes(1);
    expect(clearInvalidSession).toHaveBeenCalledTimes(1);
  });

  it("does not clear the saved session when refresh has a transient failure", async () => {
    productTransport.mockResolvedValue({ statusCode: 401, data: { code: "UNAUTHORIZED" } });
    refreshSession.mockRejectedValue(new Error("offline"));
    const { requestProductApi } = await import("../src/api/product-api-client");

    await expect(requestProductApi("/data/me", { method: "GET", fallbackMessage: "failed" }))
      .rejects.toThrow("offline");
    expect(clearInvalidSession).not.toHaveBeenCalled();
  });
});
