import assert from 'node:assert/strict';
import test from 'node:test';
import { createMealTemplateService, normalizeTemplate } from './meal-template-service.cjs';
const sourceId = '11111111-1111-4111-8111-111111111111';
const item = { name: '鸡蛋', quantityG: 75.5, caloriesPer100g: 123.45, proteinPer100g: 13.65, carbsPer100g: 1, fatPer100g: 4, aiQuantityG: 100 };
test('template validation copies only food data and rejects invalid name and quantity', () => {
  const result = normalizeTemplate({ name: ' 早餐 ', mealType: 'breakfast', items: [item], trace: 'private', confidence: 90 });
  assert.equal(result.name, '早餐'); assert.equal(result.items[0].aiQuantityG, undefined); assert.equal(result.trace, undefined);
  assert.throws(() => normalizeTemplate({ name: '', mealType: 'breakfast', items: [item] }));
  assert.throws(() => normalizeTemplate({ name: '早餐', mealType: 'breakfast', items: [{ ...item, quantityG: 0 }] }));
});
test('invalid source id is rejected before any database read', async () => {
  const service = createMealTemplateService({ db: {}, meals: { getMeal: () => { throw new Error('unexpected read'); } } });
  await assert.rejects(service.save('owner', { sourceMealId: 'bad' }), (error) => error.code === 'MEAL_DATA_INVALID');
});
function fixture() {
  const tables = { meal_templates: [], meal_records: [{ id: sourceId, user_id: 'owner', image_path: 'cloud://env/durable.jpg', recorded_at: '2026-09-10T00:00:00Z', deleted_at: null }] };
  const db = { from(table) {
    let filters = [], operation = 'select', payload, one = false, max = Infinity, rangeFrom = 0;
    const chain = {
      select() { return chain; }, eq(key, value) { filters.push((row) => row[key] === value); return chain; }, is(key, value) { return chain.eq(key, value); },
      order() { return chain; }, limit(value) { max = value; return chain; }, range(from, to) { rangeFrom = from; max = to - from + 1; return chain; },
      upsert(value) { operation = 'insert'; payload = value; return chain; }, update(value) { operation = 'update'; payload = value; return chain; }, delete() { operation = 'delete'; return chain; },
      single() { one = true; return chain; }, maybeSingle() { one = true; return chain; },
      then(resolve, reject) {
        let found = tables[table].filter((row) => filters.every((filter) => filter(row)));
        if (operation === 'insert') { const row = { id: 'template-1', ...payload }; tables[table].push(row); found = [row]; }
        if (operation === 'update') found.forEach((row) => Object.assign(row, payload));
        if (operation === 'delete') tables[table] = tables[table].filter((row) => !found.includes(row));
        const count = found.length; found = found.slice(rangeFrom, rangeFrom + max);
        return Promise.resolve({ data: one ? found[0] ?? null : found, count, error: null }).then(resolve, reject);
      },
    }; return chain;
  } };
  const meals = { getMeal: async (uid, id) => uid === 'owner' && id === sourceId ? { id, name: '早餐', mealType: 'breakfast', items: [item], imageUrl: 'https://temporary.example/expiring' } : null };
  return { tables, service: createMealTemplateService({ db, meals, resolveImageUrl: async (path) => `https://resolved.example/${path.split('/').pop()}` }) };
}
test('durable template survives independently and all reads/writes are owner scoped', async () => {
  const { tables, service } = fixture();
  const saved = await service.save('owner', { sourceMealId: sourceId });
  assert.equal(tables.meal_templates[0].image_path, 'cloud://env/durable.jpg');
  assert.equal(saved.imageUrl, 'https://resolved.example/durable.jpg');
  assert.equal((await service.save('owner', { sourceMealId: sourceId })).id, saved.id);
  assert.equal(tables.meal_templates.length, 1);
  assert.deepEqual(await service.list('other'), []);
  assert.equal(await service.get('other', saved.id), null);
  assert.equal(await service.update('other', saved.id, { name: 'bad', mealType: 'lunch', items: [item] }), null);
  assert.deepEqual(await service.remove('other', saved.id), { deleted: false });
  await service.update('owner', saved.id, { name: '新早餐', mealType: 'lunch', items: [{ ...item, quantityG: 150 }] });
  assert.equal((await service.get('owner', saved.id)).items[0].quantityG, 150);
  assert.equal(tables.meal_records.length, 1);
  assert.equal((await service.get('owner', saved.id)).useCount, 0);
  tables.meal_records.push({ user_id: 'owner', template_id: saved.id, recorded_at: '2026-09-11T00:00:00Z', deleted_at: null });
  assert.equal((await service.get('owner', saved.id)).useCount, 1);
  await service.remove('owner', saved.id);
  assert.equal(tables.meal_records.length, 2);
});
