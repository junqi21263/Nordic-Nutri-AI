import { describe, expect, it } from "vitest";
import { createClientRequestIds } from "../src/repositories/client-request-id";

describe("client meal request ids", () => {
  it("reuses one UUID while the same draft is retried", () => {
    const ids = createClientRequestIds(() => "00000000-0000-4000-8000-000000000001");

    expect(ids.forDraft("manual-1")).toBe("00000000-0000-4000-8000-000000000001");
    expect(ids.forDraft("manual-1")).toBe("00000000-0000-4000-8000-000000000001");
  });

  it("releases the id after a confirmed save", () => {
    const ids = createClientRequestIds(() => crypto.randomUUID());
    const first = ids.forDraft("manual-1");
    ids.complete("manual-1");

    expect(ids.forDraft("manual-1")).not.toBe(first);
  });
});
