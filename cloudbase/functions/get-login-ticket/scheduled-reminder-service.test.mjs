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

test("returns a failed reminder to the due queue when push delivery throws", async () => {
  const schedule = { id: "schedule-1", user_id: "user-1", meal_type: "lunch", reminder_time: "12:30:00", time_zone: "UTC", locale: "zh-CN", next_run_at: "2026-09-15T12:30:00.000Z" };
  const updates = [];
  const db = { from(table) {
    let payload;
    const query = {
      select() { return query; }, eq() { return query; }, lte() { return query; }, order() { return query; }, limit() { return query; }, is() { return query; }, gte() { return query; }, lt() { return query; },
      update(value) { payload = value; updates.push(value); return query; },
      then(resolve) { return Promise.resolve({ data: table === "meal_records" ? [] : payload ? [{ id: schedule.id }] : [schedule], error: null }).then(resolve); },
    };
    return query;
  } };
  const service = createScheduledReminderService({ db, push: { sendReminder: async () => { throw new Error("relay unavailable"); } }, now: () => new Date("2026-09-15T12:30:05.000Z") });
  const result = await service.dispatch();
  assert.equal(result.failed, 1);
  assert.equal(updates.at(-1).next_run_at, schedule.next_run_at);
});
