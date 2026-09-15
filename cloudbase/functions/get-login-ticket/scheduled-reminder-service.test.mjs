import assert from "node:assert/strict";
import test from "node:test";
import { nextRunAt, reminderCopy } from "./scheduled-reminder-service.cjs";

test("calculates the next reminder in the user's timezone", () => {
  assert.equal(nextRunAt("08:30", "Asia/Shanghai", new Date("2026-09-15T00:00:00Z")).toISOString(), "2026-09-15T00:30:00.000Z");
  assert.equal(nextRunAt("08:30", "Asia/Shanghai", new Date("2026-09-15T01:00:00Z")).toISOString(), "2026-09-16T00:30:00.000Z");
});

test("selects missed and recorded streak copy", () => {
  assert.equal(reminderCopy("breakfast", [], "2026-09-15").title, "最近有点忙？");
  const records = ["2026-09-13", "2026-09-14"].map((day) => ({ recorded_at: `${day}T04:00:00Z`, time_zone: "UTC" }));
  assert.equal(reminderCopy("lunch", records, "2026-09-15").title, "今天也记一下这一餐 🌿");
});
