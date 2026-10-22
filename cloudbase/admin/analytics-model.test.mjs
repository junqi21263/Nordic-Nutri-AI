import test from 'node:test';
import assert from 'node:assert/strict';
import { reportViews, formatValue, reportColumns, reportQuery, reportPageCount } from './analytics-model.mjs';

test('all eight approved reports and report history are available with stable API keys', () => {
  assert.deepEqual(Object.keys(reportViews), ['overview','acquisition','funnels','retention','features','versions','errors','quality','reports']);
});
test('unobserved or immature rates stay unknown rather than becoming zero', () => {
  assert.equal(formatValue(null), '—');
  assert.equal(formatValue(undefined), '—');
  assert.equal(formatValue(0, 'rate'), '0%');
  assert.equal(formatValue(0.4, 'rate'), '40%');
});
test('report paging uses full server total not returned row length', () => {
  assert.equal(reportPageCount({ total: 10001, pageSize: 50 }), 201);
});
test('query sends only supported filters and validates page', () => {
  const query = reportQuery('retention', { from:'2026-10-01',to:'2026-10-20',platform:'android',version:'1.1.20',channel:'direct',locale:'zh-CN',includeTest:true,page:2,pageSize:50,sql:'select *' });
  assert.equal(query.get('page'),'2');
  assert.equal(query.has('sql'),false);
  assert.equal(query.get('locale'),'zh-CN');
  assert.equal(query.get('includeTest'),'true');
  assert.throws(() => reportQuery('unknown', {}));
});
test('column discovery unions sparse rows without rendering identity internals', () => {
  assert.deepEqual(reportColumns([{ date:'2026-10-20', active:1 }, { date:'2026-10-21', events:2, actor_key:'private', properties:{ body:'private' } }]), ['date','active','events']);
});
