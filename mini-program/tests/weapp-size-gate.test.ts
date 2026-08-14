import { describe, expect, it } from "vitest";
import { DEFAULT_WEAPP_PACKAGE_BUDGET_BYTES } from "../../scripts/verify-weapp-size.mjs";

describe("weapp package size gate", () => {
  it("keeps a safety budget below the platform upload ceiling", () => {
    expect(DEFAULT_WEAPP_PACKAGE_BUDGET_BYTES).toBeLessThanOrEqual(1_800_000);
  });
});
