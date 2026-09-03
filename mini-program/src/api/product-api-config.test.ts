import { describe, expect, it } from "vitest";

import { resolveProductApiBaseUrl } from "./product-api-config";

describe("product API environment routing", () => {
  it("defaults development builds to the DEV endpoint", () => {
    expect(resolveProductApiBaseUrl({ configuredApiBaseUrl: "", appEnvironment: "development" })).toBe(
      "https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com",
    );
  });

  it("keeps production builds on the production endpoint", () => {
    expect(resolveProductApiBaseUrl({ configuredApiBaseUrl: "", appEnvironment: "production" })).toBe(
      "https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com",
    );
  });

  it("prefers an explicitly configured endpoint", () => {
    expect(resolveProductApiBaseUrl({
      configuredApiBaseUrl: "https://example.test/",
      appEnvironment: "development",
    })).toBe("https://example.test");
  });
});
