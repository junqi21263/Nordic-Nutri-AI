import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("persisted coach boundary", () => {
  it("uses authenticated coach history, answer, and non-generative brief endpoints", () => {
    const api = read("src/api/coach-api.ts");
    const page = read("src/pages/coach/index.tsx");

    expect(api).toContain("getProductCoachMessages");
    expect(api).toContain("sendProductCoachMessage");
    expect(api).toContain("getProductCoachBrief");
    expect(api).toContain("ProductCoachReply");
    expect(api).toContain("ProductCoachBrief");
    expect(api).toContain("/coach/messages");
    expect(api).toContain("/coach-answer");
    expect(api).toContain("/coach/brief");
    expect(page).toContain("getProductCoachMessages");
    expect(page).toContain("sendProductCoachMessage");
    expect(page).not.toContain("replyFor");
  });
});
