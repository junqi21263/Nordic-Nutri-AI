const { PublicMealDataError, normalizeItems } = require('./meal-data-service.cjs');
const invalid = () => new PublicMealDataError('MEAL_DATA_INVALID', '常吃餐食参数无效');
function normalizeTemplate(input) {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name || name.length > 100 || !['breakfast','lunch','dinner','snack'].includes(input.mealType)) throw invalid();
  return { name, meal_type: input.mealType, items: normalizeItems(input.items).map(({ aiQuantityG, ...item }) => item) };
}
function createMealTemplateService({ db, meals, resolveImageUrl }) {
  const rows = async (query) => { const r = await query; if (r.error) throw new Error('Template database request failed'); return r.data; };
  const get = (uid, id) => rows(db.from('meal_templates').select('*').eq('user_id', uid).eq('id', id).maybeSingle());
  async function map(row, uid) {
    const uses = await db.from('meal_records').select('recorded_at', { count: 'exact' }).eq('user_id', uid).eq('template_id', row.id).is('deleted_at', null).order('recorded_at', { ascending: false }).limit(1);
    if (uses.error) throw new Error('Template usage request failed');
    let imageUrl = row.image_path;
    if (imageUrl?.startsWith('cloud://')) imageUrl = await resolveImageUrl?.(imageUrl).catch(() => null);
    if (!/^https:\/\//i.test(imageUrl ?? '')) imageUrl = null;
    return { id: row.id, sourceMealId: row.source_meal_id, name: row.name, mealType: row.meal_type, items: row.items, imageUrl, useCount: uses.count ?? 0, lastRecordedAt: uses.data[0]?.recorded_at ?? null };
  }
  return {
    async list(uid) {
      const result = [];
      for (let offset = 0; ; offset += 50) {
        const found = await rows(db.from('meal_templates').select('*').eq('user_id', uid).order('updated_at', { ascending: false }).order('id').range(offset, offset + 49));
        // Bound resolution and usage requests; do not cap saved templates to recent history.
        for (let index = 0; index < found.length; index += 5) result.push(...await Promise.all(found.slice(index, index + 5).map((row) => map(row, uid))));
        if (found.length < 50) return result;
      }
    },
    async get(uid, id) { const row = await get(uid, id); return row ? map(row, uid) : null; },
    async save(uid, input) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input?.sourceMealId ?? '')) throw invalid();
      const source = await meals.getMeal(uid, input.sourceMealId);
      if (!source) throw invalid();
      const existing = await rows(db.from('meal_templates').select('*').eq('user_id', uid).eq('source_meal_id', source.id).maybeSingle());
      if (existing) return map(existing, uid);
      const original = await rows(db.from('meal_records').select('image_path').eq('user_id', uid).eq('id', source.id).is('deleted_at', null).maybeSingle());
      if (!original) throw invalid();
      const row = await rows(db.from('meal_templates').upsert({ ...normalizeTemplate(source), user_id: uid, source_meal_id: source.id, image_path: original.image_path }, { onConflict: 'user_id,source_meal_id', ignoreDuplicates: true }).select('*').maybeSingle());
      const saved = row ?? await rows(db.from('meal_templates').select('*').eq('user_id', uid).eq('source_meal_id', source.id).single());
      return map(saved, uid);
    },
    async update(uid, id, input) {
      const row = await rows(db.from('meal_templates').update({ ...normalizeTemplate(input), updated_at: new Date().toISOString() }).eq('user_id', uid).eq('id', id).select('*').maybeSingle());
      return row ? map(row, uid) : null;
    },
    async remove(uid, id) { const row = await rows(db.from('meal_templates').delete().eq('user_id', uid).eq('id', id).select('id')); return { deleted: row.length > 0 }; },
  };
}
module.exports = { createMealTemplateService, normalizeTemplate };
