import test from 'node:test';
import assert from 'node:assert/strict';
import { reportViews, metricLabels, formatValue, localizeNote, reportColumns, reportQuery, reportPageCount } from './analytics-model.mjs';

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
test('dashboard report columns and known event values render in Chinese', () => {
  assert.equal(metricLabels.web_visitors,'官网访客数');
  assert.equal(metricLabels.duration_p95,'耗时 P95');
  assert.equal(formatValue('web_page_view','event_name'),'官网页面浏览');
  assert.equal(formatValue('app_observation','funnel'),'App 观测');
  assert.equal(formatValue('other_small_sample','app_version'),'小样本合并');
  assert.equal(formatValue({ms:5000,approximate:true},'duration_p95'),'约 5,000 毫秒');
  assert.equal(formatValue('expired','status'),'已过期');
  assert.equal(localizeNote('推送accepted只表示服务商接受，displayed的观测方式未知；合并为other_small_sample。'),'推送“服务商已接受”只表示服务商接受，“已展示”的观测方式未知；合并为“小样本合并”。');
});
