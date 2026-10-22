export const reportViews = Object.freeze({ overview:'总览', acquisition:'获客渠道', funnels:'转化漏斗', retention:'留存', features:'功能使用', versions:'版本体验', errors:'体验与异常', quality:'事件质量', reports:'报告中心' });
export const metricLabels = Object.freeze({
  date:'日期（北京时间）', day:'日期（北京时间）', cohort:'激活日期', cohort_date:'激活日期', event_name:'事件', event:'事件', platform:'平台', version:'版本', app_version:'版本', channel:'渠道', campaign:'活动', medium:'媒介', content:'内容编号', first_channel:'首次渠道', recent_channel:'最近非直接渠道', page_key:'页面', feature:'功能', outcome:'结果', reason:'原因', stage:'阶段', step:'步骤', funnel:'漏斗', label:'指标', metric:'指标', count:'次数', total:'总量', value:'数值', events:'事件数', actors:'独立主体', affected_actors:'受影响主体', visitors:'访客数', page_views:'页面浏览次数', web_visitors:'官网访客数', web_page_views:'官网页面浏览次数', download_visitors:'下载访客数', observed_installs:'首次观测安装数', registered_accounts:'注册账号数', anonymous_active_installs:'未登录活跃安装数', active_accounts:'App 活跃账号数', sessions:'会话数', active:'活跃账号', active_users:'活跃账号', anonymous_actors:'未登录主体', registered:'注册账号', new_users:'新账号', installs:'首次观测安装', first_observed_installs:'首次观测安装', meals:'成功餐次', meal_saved:'成功餐次', saved_meals:'成功餐次', rate:'比例', conversion_rate:'转化率', d1:'次日留存', d7:'7 日留存', d30:'30 日留存', meal_d1:'次日记录餐食比例', cohort_accounts:'激活账号数', retention_rate:'留存率', cohort_size:'激活主体数', retained:'返回主体数', eligible:'观察期已满主体', eligible_users:'观察期已满账号', mature:'观察期已满', error_type:'错误类型', error_code:'错误码', error_fingerprint:'错误指纹', duration_ms:'耗时（ms）', duration_p95:'耗时 P95', first_chunk_ms:'首段耗时（ms）', p95_ms:'p95 耗时（ms）', last_seen:'最近发生', first_seen:'首次发生', completed:'完成', failed:'失败', unknown:'未知', accepted:'采集接收', rejected:'采集拒绝', duplicate:'重复', received:'收到', displayed:'直接观测展示', opened:'点击', coverage:'观测覆盖率', observation_method:'观测方式', pending:'待处理', delayed:'迟到', timestamp_quality:'时间质量', diagnostics:'诊断已启用', analytics:'分析已启用', source:'来源', is_test:'测试数据', numerator:'分子', denominator:'分母', successful:'成功', total_events:'事件总量', observed_actors:'可观测主体', account_actors:'账号主体', website_visitors:'官网访客', download_clicks:'下载点击', first_meal_users:'首餐账号', client_errors:'客户端异常', native_diagnostics:'原生诊断', processing_lag_ms:'处理延迟（ms）', consented_actors:'已启用分析主体', seen:'观测数', generated_at:'生成时间', error:'异常' });
const eventLabels = Object.freeze({
  web_page_view:'官网页面浏览', web_section_view:'官网板块浏览', web_demo_started:'官网演示开始', web_demo_completed:'官网演示完成', apk_download_clicked:'点击下载 App',
  first_observed_open:'首次观测打开', app_foreground:'App 进入前台', session_start:'会话开始', screen_view:'页面浏览', screen_engagement:'页面停留',
  auth_started:'开始登录', auth_completed:'登录成功', account_registered:'账号注册', onboarding_completed:'完成引导', google_credential_result:'Google 凭据结果',
  scan_opened:'打开扫描', image_upload_result:'图片上传结果', vision_started:'识别开始', vision_terminal:'识别结果', vision_result_viewed:'查看识别结果', vision_result_edited:'编辑识别结果',
  meal_save_clicked:'点击保存餐食', meal_saved:'餐食保存成功', meal_updated:'餐食已更新', meal_deleted:'餐食已删除', template_saved:'模板已保存', template_used:'使用模板',
  nova_request_started:'Nova 请求开始', nova_first_chunk:'Nova 首段返回', nova_display_terminal:'Nova 展示结果', nova_server_terminal:'Nova 服务端完成',
  notification_permission_result:'通知授权结果', notification_read:'通知已读', push_delivery_event:'推送送达事件', feedback_submitted:'提交反馈', feedback_reply_viewed:'查看反馈回复',
  account_binding_result:'账号绑定结果', reminder_updated:'提醒已更新', update_checked:'检查更新', update_clicked:'点击更新', version_observed:'版本已观测',
  client_error:'客户端异常', native_diagnostic:'原生诊断',
});
const valueLabels = Object.freeze({
  platform:{ android:'安卓应用', web:'官网' },
  funnel:{ website:'官网', app_observation:'App 观测', nova:'Nova' },
  step:{ visit:'访问', demo:'体验演示', download:'点击下载', auth_started:'开始登录', auth_completed:'登录成功', meal_saved:'保存餐食', started:'开始', display_completed:'界面展示完成', server_completed:'服务端完成' },
  channel:{ direct:'直接访问', xiaohongshu:'小红书', douyin:'抖音', wechat:'微信', google:'Google', other:'其他', unknown:'未知' },
  first_channel:{ direct:'直接访问', xiaohongshu:'小红书', douyin:'抖音', wechat:'微信', google:'Google', other:'其他', unknown:'未知' },
  recent_channel:{ direct:'直接访问', xiaohongshu:'小红书', douyin:'抖音', wechat:'微信', google:'Google', other:'其他', unknown:'未知' },
  medium:{ social:'社交', search:'搜索', direct:'直接', referral:'引荐', other:'其他' },
  campaign:{ official:'官方', launch:'上线推广', dev_test:'开发测试', organic:'自然访问', other:'其他', unknown:'未知' },
  content:{ launch_1:'上线素材 1', dev_test:'开发测试', other:'其他' },
  page_key:{ home:'首页', product:'产品', demo:'演示', download:'下载', privacy:'隐私政策', terms:'用户协议', about:'关于我们', server:'服务端', unknown:'未知' },
  outcome:{ succeeded:'成功', success:'成功', failed:'失败', completed:'完成', cancelled:'已取消', timeout:'超时', unknown:'未知' },
  status:{ pending:'等待中', running:'生成中', processing:'处理中', completed:'已完成', ready:'可下载', failed:'失败', expired:'已过期' },
  reason:{ EVENT_INVALID:'事件格式无效', UNKNOWN_FIELD:'未知字段', SERVER_EVENT_ONLY:'仅允许服务端记录', UNKNOWN_EVENT:'未知事件', SCHEMA_VERSION_INVALID:'版本无效', ID_INVALID:'标识无效', CONTEXT_INVALID:'上下文无效', TIMESTAMP_INVALID:'时间格式无效', TIMESTAMP_OUT_OF_RANGE:'超出时间范围', PROPERTIES_INVALID:'属性无效', UNKNOWN_PROPERTY:'未知属性', PROPERTY_INVALID:'属性值无效', PLATFORM_EVENT_INVALID:'平台与事件不匹配' },
  app_version:{ other_small_sample:'小样本合并' },
  error_fingerprint:{ other_small_sample:'小样本合并', unknown:'未知' },
});
const privateColumns = new Set(['actor_key','user_id','anonymous_id','collection_token','consent_revision','properties','session_id','event_id']);
export function formatValue(value, key = '') {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    if (/(^rate$|_rate$|^d[137]0?$|^coverage$)/.test(key)) return `${Math.round(value * 10000) / 100}%`;
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
  }
  if (key === 'duration_p95' && typeof value === 'object') return value.ms == null ? '超过 5 分钟' : `约 ${Number(value.ms).toLocaleString('zh-CN')} 毫秒`;
  if (typeof value === 'object') return '—';
  if (key === 'event_name' || key === 'event') return eventLabels[value] || String(value);
  return valueLabels[key]?.[value] || String(value);
}
export function localizeNote(note) {
  return String(note).replaceAll('推送accepted', '推送“服务商已接受”').replaceAll('displayed', '“已展示”').replaceAll('other_small_sample', '“小样本合并”');
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
