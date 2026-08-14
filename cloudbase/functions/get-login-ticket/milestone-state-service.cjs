const crypto = require("node:crypto");

const MILESTONES = [3, 7, 14, 30];
const CLAIM_TTL_SECONDS = 900;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function shanghaiDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : new Date(date.getTime() + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}
function shiftDay(day, amount) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
function hasValidMealData(meal) {
  return (meal?.items || []).some((item) => String(item?.name || "").trim())
    || [meal?.caloriesKcal, meal?.proteinG, meal?.carbsG, meal?.fatG].some((value) => Number(value) > 0);
}
function buildShanghaiStreak(meals) {
  const validDays = [...new Set((meals || []).filter(hasValidMealData)
    .map((meal) => shanghaiDate(meal.recordedAt ?? meal.recorded_at)).filter(Boolean))].sort();
  const cycles = [];
  for (const day of validDays) {
    const current = cycles.at(-1);
    if (!current || shiftDay(current.endDate, 1) !== day) cycles.push({ startDate: day, endDate: day, days: 1 });
    else { current.endDate = day; current.days += 1; }
  }
  return { validDays, cycles };
}
function selectHighestMilestone(days) { return [...MILESTONES].reverse().find((stage) => days >= stage) ?? null; }
function cyclesOverlap(cycle, next) { return cycle.start_date <= next.endDate && (cycle.end_date || cycle.start_date) >= next.startDate; }
function selectActiveCycleIdsToEndBeforeActivation(existing, calculatedCycles) {
  const current = calculatedCycles.at(-1);
  if (!current) return existing.filter((cycle) => cycle.status === "active").map((cycle) => cycle.id);
  const canonical = existing.filter((cycle) => cycle.status !== "merged" && cyclesOverlap(cycle, current)).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  return existing.filter((cycle) => cycle.status === "active" && cycle.id !== canonical?.id).map((cycle) => cycle.id);
}
function eventSourceForMutation(recordedAt, clock = () => new Date()) { return shanghaiDate(recordedAt) === shanghaiDate(clock()) ? "normal_record" : "backfill"; }
function normaliseFoodName(value) { return String(value || "").replace(/[（(][^）)]*[）)]/g, "").replace(/\b\d+(?:\.\d+)?\s*(?:g|克|ml|毫升)\b/gi, "").replace(/\s+/g, " ").trim(); }
function illustrationId(userId, cycleId, milestone) {
  const count = milestone <= 7 ? 3 : 2;
  return `${milestone}-${crypto.createHash("sha256").update(`${userId}:${cycleId}:${milestone}`).digest().readUInt32BE(0) % count}`;
}
function buildSnapshot({ userId, cycle, milestone, meals, plansById = new Map(), source, message, clock }) {
  const inCycle = meals.filter((meal) => { const day = shanghaiDate(meal.recordedAt); return day >= cycle.start_date && day <= cycle.end_date; });
  const daily = new Map(); const foods = new Map();
  for (const meal of inCycle) {
    const key = shanghaiDate(meal.recordedAt); const value = daily.get(key) || { calories: 0, protein: 0, carbs: 0, fat: 0, planId: meal.planId };
    value.calories += Number(meal.caloriesKcal || 0); value.protein += Number(meal.proteinG || 0); value.carbs += Number(meal.carbsG || 0); value.fat += Number(meal.fatG || 0); daily.set(key, value);
    for (const item of meal.items || []) { const name = normaliseFoodName(item.name); if (!name) continue; const id = item.foodId ? `id:${item.foodId}` : `name:${name.toLowerCase()}`; const prior = foods.get(id) || { name, count: 0 }; foods.set(id, { ...prior, count: prior.count + 1 }); }
  }
  const days = [...daily.values()]; const count = days.length || 1;
  const food = [...foods.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))[0];
  const completion = days.map((day) => { const target = Number(plansById.get(day.planId)?.daily_calories_kcal || 0); return target ? Math.min(100, Math.round(day.calories / target * 100)) : null; }).filter((value) => value != null);
  const stats = { mealsLogged: inCycle.length, recordedDays: days.length, recordingConsistency: days.length ? Math.min(100, Math.round(days.length / milestone * 100)) : undefined, avgProtein: days.length ? Math.round(days.reduce((sum, day) => sum + day.protein, 0) / count) : undefined, avgCarbs: days.length ? Math.round(days.reduce((sum, day) => sum + day.carbs, 0) / count) : undefined, avgFat: days.length ? Math.round(days.reduce((sum, day) => sum + day.fat, 0) / count) : undefined, targetCompletionRate: completion.length ? Math.round(completion.reduce((sum, value) => sum + value, 0) / completion.length) : undefined, mostLoggedFood: food?.name, mostLoggedFoodCount: food?.count };
  const priority = milestone <= 3 ? [["mealsLogged", "记录餐数"], ["recordingConsistency", "记录节奏"]] : milestone <= 7 ? [["targetCompletionRate", "目标完成"], ["mealsLogged", "记录餐数"], ["avgProtein", "平均蛋白质"]] : [["avgProtein", "平均蛋白质"], ["avgCarbs", "平均碳水"], ["avgFat", "平均脂肪"], ["mostLoggedFood", "常记录食物"]];
  const highlights = priority.map(([type, label]) => { const value = stats[type]; if (typeof value === "number" && value > 0) return { type, label, value: type.startsWith("avg") ? `${value}g` : type.includes("Rate") || type.includes("Consistency") ? `${value}%` : String(value) }; return typeof value === "string" && value ? { type, label, value } : null; }).filter(Boolean).slice(0, milestone <= 7 ? 2 : 3);
  return { cycleId: cycle.id, milestone, milestoneIndex: String(MILESTONES.indexOf(milestone) + 1).padStart(2, "0"), periodStart: cycle.start_date, periodEnd: cycle.end_date, streakDays: cycle.days, personalizedMessage: message || (food ? `连续记录 ${milestone} 天，${food.name}陪你把饮食节奏稳稳延续下去。` : `连续记录 ${milestone} 天，每一次记录都在帮你建立更稳定的饮食节奏。`).slice(0, 40), highlights, illustrationId: illustrationId(userId, cycle.id, milestone), illustrationVersion: 1, progressState: MILESTONES.map((value) => ({ milestone: value, active: value <= milestone })), statsVersion: 1, planTargets: [...new Set(inCycle.map((meal) => meal.planId).filter(Boolean))].map((id) => { const plan = plansById.get(id); return plan && { planId: id, version: plan.version ?? null, calorieTarget: Number(plan.daily_calories_kcal), proteinTarget: Number(plan.protein_g), carbsTarget: Number(plan.carbs_g), fatTarget: Number(plan.fat_g) }; }).filter(Boolean), generatedAt: (clock || (() => new Date()))().toISOString(), source };
}

function createMilestoneStateService({ db, clock = () => new Date(), generateMessage }) {
  if (!db || typeof db.from !== "function") throw new Error("Milestone database is unavailable");
  async function listMeals(userId) {
    const records = await db.from("meal_records").select("id,recorded_at,calories_kcal,protein_g,carbs_g,fat_g,plan_id").eq("user_id", userId).is("deleted_at", null).order("recorded_at", { ascending: true });
    if (records.error) throw new Error("Milestone meal read failed"); const rows = records.data || []; if (!rows.length) return [];
    const itemResult = await db.from("meal_items").select("meal_record_id,food_id,name").in("meal_record_id", rows.map((row) => row.id));
    if (itemResult.error) throw new Error("Milestone meal item read failed"); const byMeal = new Map();
    for (const item of itemResult.data || []) byMeal.set(item.meal_record_id, [...(byMeal.get(item.meal_record_id) || []), { name: item.name, foodId: item.food_id || null }]);
    return rows.map((row) => ({ recordedAt: row.recorded_at, caloriesKcal: row.calories_kcal, proteinG: row.protein_g, carbsG: row.carbs_g, fatG: row.fat_g, planId: row.plan_id || null, items: byMeal.get(row.id) || [] }));
  }
  async function queryPlans(userId, meals) {
    const ids = [...new Set(meals.map((meal) => meal.planId).filter(Boolean))]; if (!ids.length) return new Map();
    const result = await db.from("nutrition_plans").select("id,version,daily_calories_kcal,protein_g,carbs_g,fat_g").eq("user_id", userId).in("id", ids);
    if (result.error) throw new Error("Milestone plan read failed"); return new Map((result.data || []).map((plan) => [plan.id, plan]));
  }
  async function recalculateStreak(userId, { source = "normal_record" } = {}) {
    const meals = await listMeals(userId); const calculated = buildShanghaiStreak(meals);
    const existingResult = await db.from("streak_cycles").select("*").eq("user_id", userId).order("start_date", { ascending: true }); if (existingResult.error) throw new Error("Streak cycle read failed"); const existing = existingResult.data || [];
    for (const cycleId of selectActiveCycleIdsToEndBeforeActivation(existing, calculated.cycles)) { const ended = await db.from("streak_cycles").update({ status: "ended" }).eq("id", cycleId); if (ended.error) throw new Error("Streak cycle end failed"); const cycle = existing.find((item) => item.id === cycleId); if (cycle) cycle.status = "ended"; }
    const claimed = new Set(); const nextCycles = [];
    for (const next of calculated.cycles) {
      const overlap = existing.filter((cycle) => !claimed.has(cycle.id) && cycle.status !== "merged" && cyclesOverlap(cycle, next)).sort((a, b) => a.start_date.localeCompare(b.start_date)); const canonical = overlap[0]; let row;
      if (canonical) { const result = await db.from("streak_cycles").update({ start_date: next.startDate, end_date: next.endDate, status: next.endDate === calculated.cycles.at(-1)?.endDate ? "active" : "ended", canonical_cycle_id: null }).eq("id", canonical.id).select("*").single(); if (result.error || !result.data) throw new Error("Streak cycle update failed"); row = result.data; claimed.add(row.id);
        for (const merged of overlap.slice(1)) { const marked = await db.from("streak_cycles").update({ status: "merged", canonical_cycle_id: row.id }).eq("id", merged.id); if (marked.error) throw new Error("Streak cycle merge failed"); const pending = await db.from("milestone_events").select("id,milestone").eq("user_id", userId).eq("cycle_id", merged.id).eq("status", "pending"); const target = await db.from("milestone_events").select("milestone").eq("user_id", userId).eq("cycle_id", row.id); if (pending.error || target.error) throw new Error("Pending milestone merge read failed"); const stages = new Set((target.data || []).map((event) => event.milestone)); for (const event of pending.data || []) { const mutation = stages.has(event.milestone) ? db.from("milestone_events").update({ status: "invalidated", presentation_claimed_at: null, presentation_claim_token: null }).eq("id", event.id) : db.from("milestone_events").update({ cycle_id: row.id }).eq("id", event.id); const moved = await mutation; if (moved.error) throw new Error("Pending milestone migration failed"); stages.add(event.milestone); } }
      } else { const result = await db.from("streak_cycles").insert({ user_id: userId, start_date: next.startDate, end_date: next.endDate, status: next.endDate === calculated.cycles.at(-1)?.endDate ? "active" : "ended" }).select("*").single(); if (result.error || !result.data) throw new Error("Streak cycle create failed"); row = result.data; }
      nextCycles.push({ ...row, days: next.days });
    }
    const nextIds = new Set(nextCycles.map((cycle) => cycle.id)); for (const old of existing) if (!nextIds.has(old.id) && old.status === "active") { const ended = await db.from("streak_cycles").update({ status: "ended" }).eq("id", old.id); if (ended.error) throw new Error("Streak cycle end failed"); }
    for (const cycle of nextCycles) { const highest = selectHighestMilestone(cycle.days); const events = await db.from("milestone_events").select("*").eq("user_id", userId).eq("cycle_id", cycle.id); if (events.error) throw new Error("Milestone event read failed"); if (highest && !(events.data || []).some((event) => event.milestone === highest)) { const created = await db.from("milestone_events").insert({ user_id: userId, cycle_id: cycle.id, milestone: highest, achieved_at: clock().toISOString(), source, status: "pending" }); if (created.error && !/duplicate|unique/i.test(String(created.error.message || created.error.code || ""))) throw new Error("Milestone event create failed"); } for (const event of events.data || []) if (event.status === "pending" && event.milestone !== highest) { const invalidated = await db.from("milestone_events").update({ status: "invalidated", presentation_claimed_at: null, presentation_claim_token: null }).eq("id", event.id); if (invalidated.error) throw new Error("Milestone event invalidation failed"); } }
    const pending = await db.from("milestone_events").select("id,cycle_id,milestone").eq("user_id", userId).eq("status", "pending"); if (pending.error) throw new Error("Pending milestone read failed"); const highestByCycle = new Map(nextCycles.map((cycle) => [cycle.id, selectHighestMilestone(cycle.days)])); for (const event of pending.data || []) if (highestByCycle.get(event.cycle_id) !== event.milestone) { const invalidated = await db.from("milestone_events").update({ status: "invalidated", presentation_claimed_at: null, presentation_claim_token: null }).eq("id", event.id); if (invalidated.error) throw new Error("Milestone event invalidation failed"); }
    return { cycles: nextCycles, currentStreakDays: nextCycles.at(-1)?.days || 0, highestMilestone: selectHighestMilestone(nextCycles.at(-1)?.days || 0) };
  }
  async function claimPendingMilestone(userId) { const result = await db.rpc("claim_pending_milestone_event", { p_user_id: userId, p_ttl_seconds: CLAIM_TTL_SECONDS }); if (result.error) throw new Error("Milestone claim failed"); return Array.isArray(result.data) ? result.data[0] || null : result.data || null; }
  async function confirmMilestonePresented(userId, eventId, claimToken) { const event = await db.from("milestone_events").select("*").eq("id", eventId).eq("user_id", userId).maybeSingle(); if (event.error || !event.data) throw new Error("Milestone event not found"); if (event.data.status === "presented") return event.data.presentation_snapshot; if (event.data.status !== "pending" || event.data.presentation_claim_token !== claimToken) throw new Error("Milestone claim is no longer valid"); const cycle = await db.from("streak_cycles").select("*").eq("id", event.data.cycle_id).eq("user_id", userId).maybeSingle(); if (cycle.error || !cycle.data) throw new Error("Milestone cycle not found"); const meals = await listMeals(userId); const plansById = await queryPlans(userId, meals); let message = null; if (typeof generateMessage === "function") try { message = await generateMessage({ milestone: event.data.milestone, cycle: cycle.data, meals }); } catch (error) { console.warn("[milestones] message generation failed:", error?.message || error); } const snapshot = buildSnapshot({ userId, cycle: { ...cycle.data, days: event.data.milestone }, milestone: event.data.milestone, meals, plansById, source: event.data.source, message, clock }); const confirmed = await db.rpc("confirm_milestone_event_presented", { p_user_id: userId, p_event_id: eventId, p_claim_token: claimToken, p_snapshot: snapshot }); if (confirmed.error) throw new Error("Milestone presentation confirmation failed"); return snapshot; }
  async function getCurrentJourney(userId) {
    const calculated = await recalculateStreak(userId);
    const events = await db.from("milestone_events").select("id,cycle_id,milestone,status,presentation_snapshot,shown_at,shared_at")
      .eq("user_id", userId).order("achieved_at", { ascending: false });
    if (events.error) throw new Error("Milestone event read failed");
    return { ...calculated, events: events.data || [] };
  }
  async function getPresentedEvent(userId, eventId) {
    const event = await db.from("milestone_events").select("id,cycle_id,milestone,status,presentation_snapshot,shown_at,shared_at")
      .eq("id", eventId).eq("user_id", userId).maybeSingle();
    if (event.error || !event.data) throw new Error("Milestone event not found");
    if (event.data.status !== "presented" || !event.data.presentation_snapshot) throw new Error("Milestone snapshot unavailable");
    return event.data;
  }
  async function recordShare(userId, eventId) { const event = await db.rpc("record_milestone_event_share", { p_user_id: userId, p_event_id: eventId }); if (event.error) throw new Error("Milestone event not found"); return Array.isArray(event.data) ? event.data[0] || null : event.data || null; }
  return { recalculateStreak, claimPendingMilestone, confirmMilestonePresented, getCurrentJourney, getPresentedEvent, recordShare };
}
module.exports = { CLAIM_TTL_SECONDS, MILESTONES, buildShanghaiStreak, buildSnapshot, createMilestoneStateService, eventSourceForMutation, selectActiveCycleIdsToEndBeforeActivation, selectHighestMilestone };
