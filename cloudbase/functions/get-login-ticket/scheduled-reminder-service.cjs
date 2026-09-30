const MEAL_TYPES = ["breakfast", "lunch", "dinner"];
const MEAL_LABELS = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" };
const PUSH_COPY = {
  "zh-CN": {
    missed: ["最近有点忙？", "不用补齐，从这一餐重新开始就好。"],
    recorded: ["今天也记一下这一餐 🌿", "你的记录节奏正在慢慢形成。"],
    ordinary: (meal) => [`${meal}还没记录吗？`, "拍一下就好 📷"],
  },
  "zh-TW": {
    missed: ["最近是不是有點忙？", "不用補記，從這一餐重新開始就好。"],
    recorded: ["今天也記得這一餐 🌿", "你的記錄節奏正在慢慢形成。"],
    ordinary: (meal) => [`還沒記錄${meal}嗎？`, "拍張照片就好 📷"],
  },
  en: {
    missed: ["Been busy lately?", "No need to catch up—just start again with this meal."],
    recorded: ["Log this meal today 🌿", "Your logging rhythm is taking shape."],
    ordinary: (meal) => [`Haven't logged ${meal} yet?`, "A quick photo is all it takes 📷"],
  },
};
const EN_MEAL_LABELS = { breakfast: "breakfast", lunch: "lunch", dinner: "dinner" };
const TW_MEAL_LABELS = { breakfast: "早餐", lunch: "午餐", dinner: "晚餐" };

function requiredTime(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(text)) throw Object.assign(new Error("提醒时间无效"), { code: "REMINDER_TIME_INVALID" });
  return text;
}

function safeTimeZone(value) {
  const timeZone = typeof value === "string" ? value.trim() : "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    throw Object.assign(new Error("时区无效"), { code: "REMINDER_TIMEZONE_INVALID" });
  }
}

function zonedParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

function zonedDateToUtc({ year, month, day, hour, minute }, timeZone) {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = target;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(guess), timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess += target - actualAsUtc;
  }
  return new Date(guess);
}

function nextRunAt(time, timeZone, now = new Date()) {
  const local = zonedParts(now, timeZone);
  const [hour, minute] = requiredTime(time).split(":").map(Number);
  let candidate = zonedDateToUtc({ ...local, hour, minute }, timeZone);
  if (candidate <= now) {
    const tomorrow = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
    candidate = zonedDateToUtc({ year: tomorrow.getUTCFullYear(), month: tomorrow.getUTCMonth() + 1, day: tomorrow.getUTCDate(), hour, minute }, timeZone);
  }
  return candidate;
}

function localDate(value, timeZone) {
  const part = zonedParts(value, timeZone);
  return `${part.year}-${String(part.month).padStart(2, "0")}-${String(part.day).padStart(2, "0")}`;
}

function reminderCopy(mealType, records, today, locale = "zh-CN") {
  const days = new Set((records || []).map((row) => localDate(new Date(row.recorded_at), row.time_zone || "UTC")));
  let missed = 0;
  let recorded = 0;
  const base = new Date(`${today}T00:00:00Z`);
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = new Date(base); day.setUTCDate(day.getUTCDate() - offset);
    const key = day.toISOString().slice(0, 10);
    if (days.has(key) && missed === 0) recorded += 1;
    else if (!days.has(key) && recorded === 0) missed += 1;
    else break;
  }
  const language = PUSH_COPY[locale] ? locale : "zh-CN";
  const copy = PUSH_COPY[language];
  if (missed >= 2) return { title: copy.missed[0], body: copy.missed[1] };
  if (recorded >= 2) return { title: copy.recorded[0], body: copy.recorded[1] };
  const mealLabels = language === "en" ? EN_MEAL_LABELS : language === "zh-TW" ? TW_MEAL_LABELS : MEAL_LABELS;
  const [title, body] = copy.ordinary(mealLabels[mealType]);
  return { title, body };
}

function createScheduledReminderService({ db, push, now = () => new Date() }) {
  async function sync(userId, input) {
    const timeZone = safeTimeZone(input?.timeZone);
    const locale = ["zh-CN", "zh-TW", "en"].includes(input?.locale) ? input.locale : "zh-CN";
    const enabled = input?.enabled === true;
    const rows = MEAL_TYPES.map((mealType) => {
      const meal = input?.meals?.[mealType] || {};
      const time = requiredTime(meal.time);
      return {
        user_id: userId, meal_type: mealType, reminder_time: `${time}:00`, time_zone: timeZone, locale,
        enabled: enabled && meal.enabled === true,
        next_run_at: nextRunAt(time, timeZone, now()).toISOString(), updated_at: now().toISOString(),
      };
    });
    const result = await db.from("meal_reminder_schedules").upsert(rows, { onConflict: "user_id,meal_type" });
    if (result?.error) throw Object.assign(new Error("提醒排程同步失败"), { code: "REMINDER_SYNC_FAILED" });
    return { synced: true };
  }

  async function dispatch({ limit = 100 } = {}) {
    const instant = now();
    const due = await db.from("meal_reminder_schedules").select("id,user_id,meal_type,reminder_time,time_zone,locale,next_run_at").eq("enabled", true).lte("next_run_at", instant.toISOString()).order("next_run_at", { ascending: true }).limit(Math.min(Math.max(Number(limit) || 100, 1), 500));
    if (due?.error) throw Object.assign(new Error("提醒排程读取失败"), { code: "REMINDER_DISPATCH_FAILED" });
    let sent = 0; let skipped = 0;
    for (const schedule of due.data || []) {
      const tomorrow = nextRunAt(String(schedule.reminder_time).slice(0, 5), schedule.time_zone, instant);
      const claim = await db.from("meal_reminder_schedules").update({ next_run_at: tomorrow.toISOString(), last_dispatched_at: instant.toISOString(), updated_at: instant.toISOString() }).eq("id", schedule.id).eq("next_run_at", schedule.next_run_at).select("id");
      if (claim?.error || !claim?.data?.length) continue;
      const today = localDate(instant, schedule.time_zone);
      const dayStart = zonedDateToUtc({ ...zonedParts(instant, schedule.time_zone), hour: 0, minute: 0 }, schedule.time_zone);
      const nextDay = new Date(dayStart); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
      const historyStart = new Date(dayStart); historyStart.setUTCDate(historyStart.getUTCDate() - 7);
      const records = await db.from("meal_records").select("recorded_at").eq("user_id", schedule.user_id).eq("meal_type", schedule.meal_type).is("deleted_at", null).gte("recorded_at", historyStart.toISOString()).lt("recorded_at", nextDay.toISOString());
      if (records?.error) continue;
      const decorated = (records.data || []).map((row) => ({ ...row, time_zone: schedule.time_zone }));
      if (decorated.some((row) => localDate(new Date(row.recorded_at), schedule.time_zone) === today)) { skipped += 1; continue; }
      const result = await push.sendReminder({ userId: schedule.user_id, mealType: schedule.meal_type, copy: reminderCopy(schedule.meal_type, decorated, today, schedule.locale), source: "scheduled" });
      sent += result.sent || 0;
    }
    return { due: due.data?.length || 0, sent, skipped };
  }
  return { sync, dispatch };
}

module.exports = { createScheduledReminderService, nextRunAt, reminderCopy };
