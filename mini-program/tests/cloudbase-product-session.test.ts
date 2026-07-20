import { describe, expect, it } from "vitest";
import { ensureCloudbaseProductUser } from "../src/auth/cloudbase-product-session";

describe("ensureCloudbaseProductUser", () => {
  it("reuses the current app user before attempting an insert", async () => {
    const result = await ensureCloudbaseProductUser({
      from: () => ({
        select: () => ({ maybeSingle: async () => ({ data: { id: "business-user" }, error: null }) }),
        insert: () => { throw new Error("must not insert"); },
      }),
    });

    expect(result).toBe("business-user");
  });

  it("creates an empty app user row so the database assigns identity ownership", async () => {
    let payload: Record<string, never> | undefined;
    const result = await ensureCloudbaseProductUser({
      from: () => ({
        select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        insert: (input) => {
          payload = input;
          return { select: () => ({ single: async () => ({ data: { id: "new-business-user" }, error: null }) }) };
        },
      }),
    });

    expect(payload).toEqual({});
    expect(result).toBe("new-business-user");
  });
});
