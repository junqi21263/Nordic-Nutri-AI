import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateWeeklyNutrition } from './nutrition-calculation-service.cjs';
import { createInsightDataService } from './insight-data-service.cjs';
import { createDeepseekWeeklyReviewService, weeklyReviewContext } from './deepseek-weekly-review-service.cjs';

const meals = [20, 21, 22].map(day => ({ recordedAt: `2026-07-${day}T04:00:00Z`, caloriesKcal: 1000, proteinG: 50, carbsG: 100, fatG: 30 }));
const plan = { calories: 2000, proteinG: 100, carbsG: 200, fatG: 60 };
test('recorded-day averages exclude missing days, preserve future days and meal summaries', () => {
  const report = calculateWeeklyNutrition(meals, plan, '2026-07-22');
  assert.equal(report.averageCompletion.calories, 50);
  assert.equal(report.averageCompletion.protein, 50);
  assert.equal(report.rhythm[3].future, true);
  assert.equal(report.rhythm[0].mealCount, 1);
  assert.equal(report.longestRecordedStreak, 3);
  assert.equal(calculateWeeklyNutrition([], plan, '2026-07-22').averageCompletion.calories, null);
});

test('concurrent requests share generation only within the same user and cache failed AI', async () => {
  const rows = new Map();
  let calls = 0;
  const service = createInsightDataService({
    db: { from() { const filters = {}; const query = {
      select() { return query; }, eq(k, v) { filters[k] = v; return query; },
      async maybeSingle() { return { data: rows.get(`${filters.user_id}:${filters.end_date}`) }; },
      async upsert(row) { rows.set(`${row.user_id}:${row.end_date}`, row); return {}; },
    }; return query; } },
    listMealsRange: async (_user, from, to) => meals.filter(m => m.recordedAt.slice(0,10) >= from && m.recordedAt.slice(0,10) <= to),
    getNutritionPlan: async () => plan,
    weeklyReviewModel: 'configured-model',
    generateWeeklyReview: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); throw new Error('offline'); },
  });
  await Promise.all([service.getWeeklyReview('a', '2026-07-22'), service.getWeeklyReview('a', '2026-07-22')]);
  assert.equal(calls, 1);
  const cached = await service.getWeeklyReview('a', '2026-07-22');
  assert.equal(cached.insight.cached, true);
  assert.equal(calls, 1);
  await service.getWeeklyReview('b', '2026-07-22');
  assert.equal(calls, 2);
  assert.equal(rows.size, 2);
});

test('V2 rejects invented observations and skips AI for sparse records', async () => {
  let calls = 0;
  const generate = createDeepseekWeeklyReviewService({ requestCompletion: async () => {
    calls++;
    return JSON.stringify({ headline: '本周观察', summary: '你每天吃了牛排', strengths: ['减重5公斤'], nextSteps: ['下周继续'] });
  } });
  const result = await generate({ context: weeklyReviewContext(calculateWeeklyNutrition(meals, plan, '2026-07-22')) });
  assert.equal(result.source, 'rule_v1');
  assert.doesNotMatch(JSON.stringify(result), /牛排|公斤/);
  await generate({ context: weeklyReviewContext(calculateWeeklyNutrition([], plan, '2026-07-22')) });
  assert.equal(calls, 1);
});

test('comparison uses the previous matching weekday range, not the whole previous week', async () => {
  const all = [...meals, { ...meals[0], recordedAt: '2026-07-13T04:00:00Z' }, { ...meals[0], recordedAt: '2026-07-19T04:00:00Z' }];
  const service = createInsightDataService({
    listMealsRange: async (_user, from, to) => all.filter(m => m.recordedAt.slice(0,10) >= from && m.recordedAt.slice(0,10) <= to),
    getNutritionPlan: async () => plan,
  });
  const result = await service.getWeeklyReview('a', '2026-07-22', { preferFast: true });
  assert.deepEqual(result.comparison, { recordedDays: 2, recordedMeals: 2 });
});

test('missing nutrition plan does not display completion against invented personal targets', async () => {
  const service = createInsightDataService({ listMealsRange: async () => meals, getNutritionPlan: async () => null });
  const result = await service.getWeeklyReview('a', '2026-07-22', { preferFast: true });
  assert.equal(result.recordedDays, 3);
  assert.equal(result.averageCompletion.calories, null);
});
