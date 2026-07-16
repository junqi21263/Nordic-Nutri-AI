import { describe, expect, it } from "vitest";
import { selectRuntimeAdapter } from "../src/repositories/runtime-adapter";

describe("runtime repository adapter", () => {
  it("uses Supabase only for development with the real-backend flag", () => {
    expect(selectRuntimeAdapter({ environment: "development", useRealBackend: true })).toBe("supabase");
  });

  it("keeps production and disabled development on fixtures", () => {
    expect(selectRuntimeAdapter({ environment: "production", useRealBackend: true })).toBe("fixture");
    expect(selectRuntimeAdapter({ environment: "development", useRealBackend: false })).toBe("fixture");
  });
});
