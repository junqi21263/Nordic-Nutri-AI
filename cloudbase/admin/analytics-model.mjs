export const reportViews = Object.freeze({ overview:'总览', acquisition:'获客渠道', funnels:'转化漏斗', retention:'留存', features:'功能使用', versions:'版本体验', errors:'体验与异常', quality:'事件质量', reports:'报告中心' });
export const metricLabels = Object.freeze({
  date:'日期（北京时间）', day:'日期（北京时间）', cohort:'激活日期', cohort_date:'激活日期', event_name:'事件', event:'事件', platform:'平台', version:'版本', app_version:'版本', channel:'渠道', campaign:'活动', medium:'媒介', content:'内容编号', first_channel:'首次渠道', recent_channel:'最近非直接渠道', page_key:'页面', feature:'功能', outcome:'结果', reason:'原因', stage:'阶段', step:'步骤', label:'指标', metric:'指标', count:'次数', total:'总量', value:'数值', events:'事件数', actors:'独立主体', users:'独立账号', sessions:'会话数', active:'活跃账号', active_users:'活跃账号', anonymous_actors:'未登录主体', registered:'注册账号', new_users:'新账号', installs:'首次观测安装', first_observed_installs:'首次观测安装', meals:'成功餐次', meal_saved:'成功餐次', saved_meals:'成功餐次', rate:'比例', conversion_rate:'转化率', d1:'次日留存', d7:'7 日留存', d30:'30 日留存', retention_rate:'留存率', cohort_size:'激活主体数', retained:'返回主体数', eligible:'观察期已满主体', eligible_users:'观察期已满账号', mature:'观察期已满', error_type:'错误类型', error_code:'错误码', error_fingerprint:'错误指纹', duration_ms:'耗时（ms）', first_chunk_ms:'首段耗时（ms）', p95_ms:'p95 耗时（ms）', last_seen:'最近发生', first_seen:'首次发生', completed:'完成', failed:'失败', unknown:'未知', accepted:'采集接收', rejected:'采集拒绝', duplicate:'重复', received:'收到', displayed:'直接观测展示', opened:'点击', coverage:'观测覆盖率', observation_method:'观测方式', pending:'待处理', delayed:'迟到', timestamp_quality:'时间质量', diagnostics:'诊断已启用', analytics:'分析已启用', source:'来源', is_test:'测试数据', numerator:'分子', denominator:'分母', successful:'成功', total_events:'事件总量', observed_actors:'可观测主体', account_actors:'账号主体', website_visitors:'官网访客', download_clicks:'下载点击', first_meal_users:'首餐账号', client_errors:'客户端异常', native_diagnostics:'原生诊断', processing_lag_ms:'处理延迟（ms）', consented_actors:'已启用分析主体', seen:'观测数', generated_at:'生成时间', error:'异常' });
const privateColumns = new Set(['actor_key','user_id','anonymous_id','collection_token','consent_revision','properties','session_id','event_id']);
export function formatValue(value, key = '') {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    if (/(^rate$|_rate$|^d[137]0?$|^coverage$)/.test(key)) return `${Math.round(value * 10000) / 100}%`;
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }
  return typeof value === 'object' ? '—' : String(value);
}
export function reportColumns(rows) {
  return [...new Set((rows || []).flatMap((row) => Object.keys(row || {})))].filter((key) => !privateColumns.has(key)).slice(0,24);
}
export function reportQuery(view, filters) {
  if (!Object.hasOwn(reportViews,view)) throw new Error('不支持的报告');
  const query = new URLSearchParams({ view });
  for (const name of ['from','to','platform','version','channel','medium','content','locale']) if (filters[name]) query.set(name,String(filters[name]));
  if (filters.includeTest) query.set('includeTest','true');
  query.set('page',String(Math.max(1,Math.floor(Number(filters.page) || 1))));
  query.set('pageSize',String(Math.min(100,Math.max(1,Math.floor(Number(filters.pageSize) || 50)))));
  return query;
}
export function reportPageCount({ total = 0, pageSize = 50 }) { return Math.max(1, Math.ceil(Number(total) / Math.max(1, Number(pageSize)))); }
