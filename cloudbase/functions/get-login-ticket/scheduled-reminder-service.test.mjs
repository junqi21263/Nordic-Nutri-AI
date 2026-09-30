import assert from "node:assert/strict";
import test from "node:test";
import { createScheduledReminderService, nextRunAt, reminderCopy } from "./scheduled-reminder-service.cjs";

test("calculates the next reminder in the user's timezone", () => {
  assert.equal(nextRunAt("08:30", "Asia/Shanghai", new Date("2026-09-15T00:00:00Z")).toISOString(), "2026-09-15T00:30:00.000Z");
  assert.equal(nextRunAt("08:30", "Asia/Shanghai", new Date("2026-09-15T01:00:00Z")).toISOString(), "2026-09-16T00:30:00.000Z");
});

test("selects missed and recorded streak copy", () => {
  assert.equal(reminderCopy("breakfast", [], "2026-09-15").title, "最近有点忙？");
  const records = ["2026-09-13", "2026-09-14"].map((day) => ({ recorded_at: `${day}T04:00:00Z`, time_zone: "UTC" }));
  assert.equal(reminderCopy("lunch", records, "2026-09-15").title, "今天也记一下这一餐 🌿");
});

test("localizes scheduled push copy for Traditional Chinese and English", () => {
  assert.deepEqual(reminderCopy("dinner", [], "2026-09-15", "zh-TW"), {
    title: "最近是不是有點忙？",
    body: "不用補記，從這一餐重新開始就好。",
  });
  assert.deepEqual(reminderCopy("dinner", [], "2026-09-15", "en"), {
    title: "Been busy lately?",
    body: "No need to catch up—just start again with this meal.",
  });
});

test("stores the current supported locale with every synced schedule", async () => {
  let scheduledRows = [];
  const db = {
    from: () => ({
      upsert: async (rows) => { scheduledRows = rows; return { error: null }; },
    }),
  };
  const service = createScheduledReminderService({ db, push: {}, now: () => new Date("2026-09-15T00:00:00Z") });
  await service.sync("user-1", {
    enabled: true,
    timeZone: "Asia/Taipei",
    locale: "zh-TW",
    meals: {
      breakfast: { enabled: true, time: "08:30" },
      lunch: { enabled: true, time: "12:30" },
      dinner: { enabled: true, time: "19:00" },
    },
  });
  assert.equal(scheduledRows.length, 3);
  assert.deepEqual(scheduledRows.map((row) => row.locale), ["zh-TW", "zh-TW", "zh-TW"]);
});
