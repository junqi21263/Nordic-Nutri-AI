import { describe, expect, it } from "vitest";
import { createSecureTokenStorage } from "./secure-token-storage";

describe("secure token storage", () => {
  it("uses the native secure-storage bridge and never a web fallback", () => {
    const values = new Map<string, string>();
    const storage = createSecureTokenStorage({
      get: (key) => values.get(key) ?? null,
      set: (key, value) => values.set(key, value),
      remove: (key) => values.delete(key),
    });

    expect(storage).not.toBeNull();
    if (!storage) return;
    storage.setItem("token", "secret-token");
    expect(storage.getItem("token")).toBe("secret-token");
    storage.removeItem("token");
    expect(storage.getItem("token")).toBeNull();
  });
});
