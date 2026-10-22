import { reportViews, metricLabels, formatValue, localizeNote, reportColumns, reportQuery, reportPageCount } from './analytics-model.mjs?v=20261022-8';

const host = document.getElementById('moduleAnalytics');
const escape = (value) => String(value ?? '').replace(/[&<>"']/g,(char) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
const state = { view:'overview', page:1, pageSize:25, generation:0, report:null, history:new Map() };
const dateKey = (value) => new Date(value + 8*3600_000).toISOString().slice(0,10);
const today = dateKey(Date.now());
const start = dateKey(Date.now()-6*86400_000);
if (host) {
  host.innerHTML = `<div class="module-toolbar"><div><p class="eyebrow">产品 / 使用分析</p><h2>用户分析 <span id="analyticsEnvironment" class="environment-badge"></span></h2></div><div class="analytics-actions"><button type="button" class="button secondary" id="analyticsExportCsv">导出 CSV</button><button type="button" class="button secondary" id="analyticsExportHtml">报告 / 打印 PDF</button></div></div>
    <nav class="analytics-tabs" aria-label="分析报告">${Object.entries(reportViews).map(([key,label]) => `<button type="button" class="button secondary" data-analytics-view="${key}" aria-pressed="${key === state.view}">${label}</button>`).join('')}</nav>
    <form id="analyticsFilters" class="analytics-filters"><label>时间范围<select name="preset"><option value="7d">近 7 天</option><option value="today">今天</option><option value="yesterday">昨天</option><option value="30d">近 30 天</option><option value="custom">自定义</option></select></label><label>开始日期<input type="date" name="from" value="${start}" required></label><label>结束日期<input type="date" name="to" value="${today}" required></label><label>平台<select name="platform"><option value="">全部</option><option value="android">安卓应用</option><option value="web">官网</option></select></label><button class="button" type="submit">应用筛选</button></form>
    <p id="analyticsStatus" class="muted" role="status" aria-live="polite"></p><p id="analyticsWatermark" class="analytics-watermark muted"></p><div id="analyticsSummary" class="analytics-summary"></div><div id="analyticsSeries" class="analytics-series"></div><div id="analyticsRows" class="analytics-table"></div><div class="analytics-pagination"><button type="button" class="button secondary" id="analyticsPrevious">上一页</button><span id="analyticsPage"></span><button type="button" class="button secondary" id="analyticsNext">下一页</button></div><div id="analyticsNotes" class="analytics-notes"></div><p id="analyticsExportStatus" class="muted" role="status" aria-live="polite"></p>`;
  document.getElementById('analyticsEnvironment').textContent = document.getElementById('adminEnvironmentBadge')?.textContent || '';
}
const node = (id) => document.getElementById(id);
const reportTemplates = { overview:'产品运营报告', acquisition:'官网推广效果报告', versions:'版本体验报告' };
function filters() {
  const form = new FormData(node('analyticsFilters'));
  const isDev = /\bDEV\b/i.test(node('adminEnvironmentBadge')?.textContent || '');
  return { from:form.get('from'),to:form.get('to'),platform:form.get('platform'),includeTest:isDev,page:state.page,pageSize:state.pageSize };
}
function label(key) { return metricLabels[key] || key; }
function table(rows) {
  const columns = reportColumns(rows);
  if (!rows.length || !columns.length) return '<p class="muted analytics-empty">此筛选下暂无可观测数据。</p>';
  return `<table><thead><tr>${columns.map((key) => `<th>${escape(label(key))}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((key) => `<td>${escape(formatValue(row[key],key))}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
}
function summary(report) {
  return Object.entries(report.summary || {}).filter(([key,value]) => key !== 'anonymous_active_installs' && (value === null || typeof value !== 'object')).map(([key,value]) => `<div class="analytics-stat"><span>${escape(label(key))}</span><strong>${escape(formatValue(value,key))}</strong></div>`).join('');
}
function trendChart(series) {
  const metric = reportColumns(series).find((key) => !['date','day','timestamp'].includes(key) && series.some((row) => typeof row[key] === 'number'));
  if (!metric || series.length < 2) return '';
  const values = series.map((row) => typeof row[metric] === 'number' && Number.isFinite(row[metric]) ? row[metric] : null);
  const finite = values.filter((value) => value !== null);
  const min = Math.min(0,...finite), max = Math.max(1,...finite);
  const x = (index) => 36 + index * 648 / Math.max(1,values.length - 1);
  const y = (value) => 160 - (value - min) * 130 / (max - min || 1);
  let continued = false;
  const path = values.map((value,index) => { if (value === null) { continued = false; return ''; } const point = `${continued ? 'L' : 'M'}${x(index)},${y(value)}`; continued = true; return point; }).join(' ');
  return `<figure class="analytics-trend"><figcaption>${escape(label(metric))} · 日趋势</figcaption><svg viewBox="0 0 720 190" role="img" aria-label="${escape(label(metric))}日趋势，未知值不补零"><path d="M36 30V160H684" class="analytics-axis"/><path d="${path}" class="analytics-line"/>${values.map((value,index) => value === null ? '' : `<circle cx="${x(index)}" cy="${y(value)}" r="3"><title>${escape(series[index].date || series[index].day || '')}: ${escape(formatValue(value,metric))}</title></circle>`).join('')}<text x="36" y="182">${escape(series[0]?.date || series[0]?.day || '')}</text><text x="684" y="182" text-anchor="end">${escape(series.at(-1)?.date || series.at(-1)?.day || '')}</text></svg></figure>`;
}
function render(report) {
  node('analyticsSummary').innerHTML = summary(report);
  const series = Array.isArray(report.series) ? report.series : [];
  node('analyticsSeries').innerHTML = series.length ? `${trendChart(series)}<details><summary>查看趋势明细</summary>${table(series)}</details>` : '';
  node('analyticsRows').innerHTML = table(Array.isArray(report.rows) ? report.rows : []);
  const pages = reportPageCount(report);
  state.page = Math.max(1,Number(report.page) || state.page);
  node('analyticsPage').textContent = `第 ${state.page} / ${pages} 页 · 共 ${Number(report.total || 0).toLocaleString('zh-CN')} 条`;
  node('analyticsPrevious').disabled = state.page <= 1;
  node('analyticsNext').disabled = state.page >= pages;
  node('analyticsWatermark').textContent = '';
  const notes = [
    '旧版本、未启用分析以及未成功送达的行为不在观测范围，历史数据无法补回。',
    '官网漏斗与 App 漏斗独立统计；下载点击不代表安装。留存观察期未满显示 —；多日独立用户按整体去重。',
    '推送服务接受不等于手机收到；没有直接回执的展示状态为未知。',
    ...(Array.isArray(report.notes) ? report.notes.map(localizeNote) : []),
  ];
  node('analyticsNotes').innerHTML = `<h3>口径与覆盖</h3><ul>${notes.map((note) => `<li>${escape(note)}</li>`).join('')}</ul>`;
}
async function load() {
  if (!host) return;
  const generation = ++state.generation;
  const currentFilters = filters();
  if (currentFilters.from > currentFilters.to) { node('analyticsStatus').textContent = '开始日期不能晚于结束日期。'; return; }
  node('analyticsStatus').textContent = '正在查询分析报告…';
  node('analyticsPrevious').disabled = true;
  node('analyticsNext').disabled = true;
  try {
    const report = state.view === 'reports'
      ? await api(`/analytics/reports?page=${state.page}&pageSize=${state.pageSize}`)
      : await api(`/analytics/report?${reportQuery(state.view,currentFilters)}`);
    if (generation !== state.generation) return;
    state.report = state.view === 'reports' ? null : report;
    if (state.view === 'reports') renderHistory(report);
    else render(report);
    const hasSummary = Object.values(report.summary || {}).some((value) => typeof value === 'number' && value > 0);
    node('analyticsStatus').textContent = state.view === 'reports' ? '' : Number(report.total || 0) === 0 && !hasSummary ? '当前筛选范围没有可观测数据。' : '';
  } catch (error) {
    if (generation !== state.generation) return;
    state.report = null;
    node('analyticsStatus').textContent = error?.json?.code === 'ANALYTICS_ORIGIN_DENIED' ? '当前后台地址未获分析接口授权。' : error?.status === 401 ? '后台登录已失效，请重新登录。' : error?.status === 403 ? '当前账号无权查看使用分析。' : `报告暂不可用：${apiErrorMessage(error)}`;
    node('analyticsSummary').replaceChildren();
    node('analyticsSeries').replaceChildren();
    node('analyticsRows').replaceChildren();
    node('analyticsWatermark').textContent = '';
    node('analyticsPage').textContent = '';
  }
}
function reportHistoryRow(item) {
  const expired = Number.isFinite(Date.parse(item.expires_at)) && Date.parse(item.expires_at) <= Date.now();
  const retry = expired || item.status === 'failed' || item.status === 'expired';
  const action = retry ? `<button type="button" class="button secondary" data-report-retry="${escape(item.id)}">重新生成</button>`
    : item.status === 'completed' || item.status === 'ready' ? `<button type="button" class="button secondary" data-report-preview="${escape(item.id)}">预览</button> <button type="button" class="button secondary" data-report-download="${escape(item.id)}">下载</button>` : '生成中';
  return `<tr><td>${escape(reportTemplates[item.view] || item.view || '分析报告')}</td><td>${escape(formatValue(expired ? 'expired' : item.status || 'unknown','status'))}</td><td>${escape(item.created_at || '—')}</td><td>${escape(item.watermark || '—')}</td><td>${escape(item.expires_at || '—')}</td><td>${action}</td></tr>`;
}
function renderHistory(result) {
  const items = Array.isArray(result.items) ? result.items : [];
  state.history = new Map(items.map((item) => [item.id,item]));
  node('analyticsSummary').replaceChildren();
  node('analyticsSeries').replaceChildren();
  node('analyticsWatermark').textContent = '报告仅包含聚合数据，快照保留 7 天；下载时重新验证当前管理员权限。';
  node('analyticsRows').innerHTML = `<div class="analytics-report-create"><label>报告模板 <select id="analyticsTemplate">${Object.entries(reportTemplates).map(([key,value]) => `<option value="${key}">${value}</option>`).join('')}</select></label><span>先在对应分析页预览当前口径，再使用上方按钮生成 CSV 或打印版报告。</span></div>${items.length ? `<table><thead><tr><th>报告</th><th>状态</th><th>创建时间</th><th>数据水位</th><th>有效期</th><th>操作</th></tr></thead><tbody>${items.map(reportHistoryRow).join('')}</tbody></table>` : '<p class="muted analytics-empty">当前环境尚无手动生成的报告。</p>'}`;
  const pages = reportPageCount(result);
  state.page = Math.max(1,Number(result.page) || state.page);
  node('analyticsPage').textContent = `第 ${state.page} / ${pages} 页 · 共 ${Number(result.total || 0).toLocaleString('zh-CN')} 份`;
  node('analyticsPrevious').disabled = state.page <= 1;
  node('analyticsNext').disabled = state.page >= pages;
  node('analyticsNotes').replaceChildren();
  node('analyticsRows').querySelectorAll('[data-report-preview],[data-report-download],[data-report-retry]').forEach((button) => button.addEventListener('click',() => { void reportAction(button); }));
}
async function deliverFile(id, preview = false) {
  const file = await api(`/analytics/reports/${encodeURIComponent(id)}/download`);
  if (typeof file.content !== 'string' || !['text/csv','text/html'].some((type) => String(file.contentType).startsWith(type))) throw new Error('报告文件格式异常');
  const url = URL.createObjectURL(new Blob([file.content],{ type:file.contentType }));
  const link = document.createElement('a');
  link.href = url;
  if (preview) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  else link.download = String(file.filename || `nordic-analytics-${today}.csv`).replace(/[/\\]/g,'-');
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url),10000);
}
async function reportAction(button) {
  const id = button.dataset.reportPreview || button.dataset.reportDownload || button.dataset.reportRetry;
  node('analyticsExportStatus').textContent = '正在处理报告…';
  button.disabled = true;
  try {
    if (button.dataset.reportRetry) {
      const job = state.history.get(id);
      if (!job?.view || !job.filters) throw new Error('报告元信息不可用');
      await api('/analytics/reports',{ method:'POST',body:{ view:job.view,filters:job.filters,format:job.format || 'csv' } });
      await load();
      node('analyticsExportStatus').textContent = '已重新提交报告生成任务。';
    } else {
      await deliverFile(id,Boolean(button.dataset.reportPreview));
      node('analyticsExportStatus').textContent = button.dataset.reportPreview ? '报告预览已打开。' : '下载链接已生成。';
    }
  } catch (error) { node('analyticsExportStatus').textContent = `报告操作失败：${apiErrorMessage(error)}`; }
  finally { button.disabled = false; }
}
async function exportReport(format) {
  if (!state.report && state.view !== 'reports') { node('analyticsExportStatus').textContent = '请先完成一次报告查询。'; return; }
  const current = state.view === 'reports' ? { view:node('analyticsTemplate')?.value || 'overview',filters:filters() } : state.report;
  node('analyticsExportStatus').textContent = '正在创建固定水位的报告快照…';
  node('analyticsExportCsv').disabled = true;
  node('analyticsExportHtml').disabled = true;
  try {
    let job = await api('/analytics/reports',{ method:'POST',body:{ view:current.view || state.view, filters:current.filters || filters(),format } });
    const id = job.id || job.report_id;
    if (!id) throw new Error('报告任务缺少 ID');
    for (let attempt = 0; ['pending','running','queued'].includes(job.status) && attempt < 15; attempt++) {
      await new Promise((resolve) => setTimeout(resolve,1000));
      job = await api(`/analytics/reports/${encodeURIComponent(id)}`);
    }
    if (job.status !== 'completed' && job.status !== 'ready') throw new Error(job.status === 'failed' ? '报告生成失败，请重试' : '报告仍在生成，请稍后重新导出');
    await deliverFile(id);
    node('analyticsExportStatus').textContent = `下载链接已生成 · 水位 ${job.watermark || current.watermark || '见文件'} · 有效期 ${job.expires_at || '7 天'}${format === 'html' ? '。打开 HTML 后可通过浏览器打印保存为 PDF。' : ''}`;
    if (state.view === 'reports') void load();
  } catch (error) { node('analyticsExportStatus').textContent = `导出失败：${apiErrorMessage(error)}`; }
  finally { node('analyticsExportCsv').disabled = false; node('analyticsExportHtml').disabled = false; }
}
if (host) {
  node('analyticsFilters').elements.preset.addEventListener('change',(event) => {
    const preset = event.target.value;
    if (preset === 'custom') return;
    const end = preset === 'yesterday' ? Date.now()-86400_000 : Date.now();
    const days = preset === '30d' ? 30 : preset === '7d' ? 7 : 1;
    node('analyticsFilters').elements.from.value = dateKey(end-(days-1)*86400_000);
    node('analyticsFilters').elements.to.value = dateKey(end);
    state.page = 1;
    void load();
  });
  for (const field of ['from','to']) node('analyticsFilters').elements[field].addEventListener('change',() => { node('analyticsFilters').elements.preset.value = 'custom'; });
  host.querySelectorAll('[data-analytics-view]').forEach((button) => button.addEventListener('click',() => {
    state.view = button.dataset.analyticsView; state.page = 1;
    host.querySelectorAll('[data-analytics-view]').forEach((tab) => tab.setAttribute('aria-pressed',String(tab === button)));
    void load();
  }));
  node('analyticsFilters').addEventListener('submit',(event) => { event.preventDefault(); state.page = 1; void load(); });
  node('analyticsPrevious').addEventListener('click',() => { state.page = Math.max(1,state.page-1); void load(); });
  node('analyticsNext').addEventListener('click',() => { state.page++; void load(); });
  node('analyticsExportCsv').addEventListener('click',() => { void exportReport('csv'); });
  node('analyticsExportHtml').addEventListener('click',() => { void exportReport('html'); });
  window.NordicAnalytics = { load };
  if (!host.hidden) void load();
}
