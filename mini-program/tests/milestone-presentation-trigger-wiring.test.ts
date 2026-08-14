import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("milestone presentation trigger wiring", () => {
  it("uses one normal-save coordinator trigger for new records only", () => {
    expect(source("src/pages/analysis-result/index.tsx")).toContain('tryPresentPendingMilestone("normal_record_success")');
    expect(source("src/pages/manual-meal/index.tsx")).toContain('shouldClaimAfterMealSave(recordedAt)');
    expect(source("src/pages/manual-meal/index.tsx")).toContain('tryPresentPendingMilestone("normal_record_success")');
    expect(source("src/pages/portion-adjustment/index.tsx")).toContain('editingId ? undefined');
    expect(source("src/pages/portion-adjustment/index.tsx")).toContain('tryPresentPendingMilestone("normal_record_success")');
  });

  it("keeps Home as the coordinator fallback", () => {
    expect(source("src/pages/home/index.tsx")).toContain('tryPresentPendingMilestone("home_did_show")');
  });
});
