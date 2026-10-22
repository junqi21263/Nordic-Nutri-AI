const crypto=require('node:crypto');
const { UUID,validateEvent }=require('./analytics-schema.cjs');
class AnalyticsError extends Error {constructor(code,status=400){super(code);this.code=code;this.status=status;this.statusCode=status;}}
const VIEWS=new Set(['overview','acquisition','funnels','retention','features','versions','errors','quality']);
function csvCell(value){const s=value===null||value===undefined?'':typeof value==='object'?JSON.stringify(value):String(value);return '"'+(/^[\s]*[=+@\-\t\r]/.test(s)?"'":'')+s.replaceAll('"','""')+'"';}
function htmlEscape(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');}
function createAnalyticsService({db,environment,secret,enabled=true,now=()=>new Date()}){
 if(!db?.rpc||typeof environment!=='string'||!environment||typeof secret!=='string'||secret.length<16)throw new AnalyticsError('ANALYTICS_NOT_CONFIGURED',503);
 const clock=()=>{const t=now();return t instanceof Date?t:new Date(t);};
 async function rpc(name,args){
  const result=await db.rpc(name,args);
  if(result.error){const known=String(result.error.message||'').match(/ANALYTICS_[A-Z_]+/)?.[0];const code=known||'ANALYTICS_DATABASE_UNAVAILABLE';throw new AnalyticsError(code,/RATE_LIMITED/.test(code)?429:/REVOKED|IDENTITY|PROOF|CREDENTIAL|FRESH_ID/.test(code)?403:known?400:503);}
  const data=result.data;if(Array.isArray(data)&&data.length===1&&Object.hasOwn(data[0]||{},name))return data[0][name];if(data&&Object.hasOwn(data,name))return data[name];return data;
 }
 function sign(data){const b=Buffer.from(JSON.stringify(data)).toString('base64url');return b+'.'+crypto.createHmac('sha256',secret).update(b).digest('base64url');}
 function verify(token){
  if(typeof token!=='string'||token.length>2048)throw new AnalyticsError('ANALYTICS_CREDENTIAL_INVALID',403);
  const [b,sig,...extra]=token.split('.');let data;try{
   const expected=crypto.createHmac('sha256',secret).update(b||'').digest();const actual=Buffer.from(sig||'','base64url');
   if(extra.length||actual.length!==expected.length||!crypto.timingSafeEqual(actual,expected))throw new Error('signature');
   data=JSON.parse(Buffer.from(b,'base64url').toString());
  }catch{throw new AnalyticsError('ANALYTICS_CREDENTIAL_INVALID',403);}
  if(data.environment!==environment||data.exp<=clock().getTime()||!UUID.test(data.revision)||!UUID.test(data.anonymous_id))throw new AnalyticsError('ANALYTICS_CREDENTIAL_INVALID',403);
  return data;
 }
 function response(row,userId){
  const expires=row.expires_at||new Date(clock().getTime()+30*86400000).toISOString();
  return {analytics:Boolean(row.analytics),diagnostics:Boolean(row.diagnostics),consent_revision:row.consent_revision,
   collection_token:sign({environment,revision:row.consent_revision,anonymous_id:row.anonymous_id,platform:row.platform,user_id:userId||null,exp:new Date(expires).getTime()}),expires_at:expires};
 }
 async function setConsent({userId=null,body}={}){
  if(!enabled)return {analytics:false,diagnostics:false,disabled:true};
  if(!body||Object.keys(body).some(k=>!['anonymous_id','platform','analytics','diagnostics','consent_revision','collection_token'].includes(k))||!UUID.test(body.anonymous_id)||!['android','web'].includes(body.platform)||typeof body.analytics!=='boolean'||typeof body.diagnostics!=='boolean'||(userId!==null&&!UUID.test(userId)))throw new AnalyticsError('ANALYTICS_CONSENT_INVALID');
  let previous=null;
  if(body.collection_token){const proof=verify(body.collection_token);if(proof.anonymous_id!==body.anonymous_id||proof.user_id!==(userId||null))throw new AnalyticsError('ANALYTICS_IDENTITY_MISMATCH',403);previous=proof.revision;}
  // A client-supplied UUID is never proof of ownership of a previous anonymous grant.
  const actor=crypto.createHmac('sha256',secret).update(environment+':'+(userId?'user:'+userId:'anonymous:'+body.anonymous_id)).digest('hex');
  const row=await rpc('analytics_set_consent',{p_environment:environment,p_anonymous_id:body.anonymous_id,p_platform:body.platform,p_user_id:userId,p_actor_key:actor,p_analytics:body.analytics,p_diagnostics:body.diagnostics,p_previous_revision:previous});
  return response({...row,anonymous_id:body.anonymous_id,platform:body.platform},userId);
 }
 async function getConsent({userId=null,anonymousId,platform='android',collectionToken}={}){
  if(!enabled)return {analytics:false,diagnostics:false,disabled:true};
  anonymousId ??= undefined; platform ||= 'android';
  if(anonymousId!==undefined&&!UUID.test(anonymousId)||!['android','web'].includes(platform))throw new AnalyticsError('ANALYTICS_CONSENT_INVALID');
  if(userId===null){
   const proof=verify(collectionToken);
   if(proof.user_id!==null||proof.anonymous_id!==anonymousId||proof.platform!==platform)throw new AnalyticsError('ANALYTICS_IDENTITY_MISMATCH',403);
   const result=await db.from('analytics_consent_records').select('*').eq('consent_revision',proof.revision).eq('environment',environment).maybeSingle();
   if(result.error)throw new AnalyticsError('ANALYTICS_DATABASE_UNAVAILABLE',503);
   if(!result.data||result.data.revoked_at||new Date(result.data.expires_at)<=clock())return {analytics:false,diagnostics:false,revoked:true};
   return response(result.data,null);
  }
  if(!UUID.test(userId))throw new AnalyticsError('ANALYTICS_CONSENT_INVALID');
  const row=await rpc('analytics_get_consent',{p_environment:environment,p_user_id:userId,p_anonymous_id:anonymousId||null,p_platform:platform});
  if(!row?.consent_revision)return {analytics:false,diagnostics:false};
  // An account preference cannot grant collection on a fresh device without its own anonymous ID.
  if(!anonymousId)return {analytics:false,diagnostics:false,account_analytics:Boolean(row.analytics),account_diagnostics:Boolean(row.diagnostics),device_grant:false};
  return response(row,userId);
 }
 async function ingest({body,userId=null}={}){
  if(!enabled)return {disabled:true,results:[]};
  if(!body||Object.keys(body).some(k=>!['collection_token','events'].includes(k))||!Array.isArray(body.events)||body.events.length>50||!body.events.length||Buffer.byteLength(JSON.stringify(body))>65536)throw new AnalyticsError('ANALYTICS_BATCH_INVALID');
  const proof=verify(body.collection_token);
  if(proof.user_id!==(userId||null))throw new AnalyticsError('ANALYTICS_IDENTITY_MISMATCH',403);
  const results=[],valid=[];
  for(const e of body.events){const v=validateEvent(e,clock());let reason=v.reason;
   if(!reason&&(e.consent_revision!==proof.revision||e.anonymous_id!==proof.anonymous_id||e.platform!==proof.platform))reason='CONTEXT_MISMATCH';
   if(reason)results.push({event_id:UUID.test(e?.event_id)?e.event_id:null,status:'rejected',reason});else valid.push({...v.event,diagnostic:v.diagnostic});
  }
  if(valid.length){const result=await rpc('analytics_ingest',{p_environment:environment,p_revision:proof.revision,p_user_id:userId,p_events:valid});if(result.results.some(r=>r.reason==='RATE_LIMITED'))throw new AnalyticsError('ANALYTICS_RATE_LIMITED',429);results.push(...result.results);}
  return {results};
 }
 function filters(input={}){
  const today=new Date(clock().getTime()+8*3600000).toISOString().slice(0,10);
  const from=input.from||new Date(new Date(today+'T00:00:00Z').getTime()-13*86400000).toISOString().slice(0,10),to=input.to||today;
  const start=new Date(from+'T00:00:00Z'),end=new Date(to+'T00:00:00Z');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(+start)||!Number.isFinite(+end)||start.toISOString().slice(0,10)!==from||end.toISOString().slice(0,10)!==to||+end<+start||+end-+start>365*86400000)throw new AnalyticsError('ANALYTICS_FILTER_INVALID');
  const platform=input.platform||'all',version=input.version||'',channel=input.channel||'',locale=input.locale||'',medium=input.medium||'',content=input.content||'';
  const page=Number(input.page||1),pageSize=Number(input.pageSize||30);
  if(!['all','android','web'].includes(platform)||!/^[\w.-]{0,32}$/.test(version)||!['','direct','xiaohongshu','douyin','wechat','google','other'].includes(channel)||!['','zh-CN','zh-TW','en'].includes(locale)||!['','social','search','direct','referral','other'].includes(medium)||!['','launch_1','dev_test','other'].includes(content)||!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new AnalyticsError('ANALYTICS_FILTER_INVALID');
  return {from,to,platform,version,channel,locale,medium,content,page,pageSize,includeTest:input.includeTest===true||input.includeTest==='true'};
 }
 async function report(input={}){const view=input.view||'overview';if(!VIEWS.has(view))throw new AnalyticsError('ANALYTICS_VIEW_INVALID');const selected=filters(input);if(view!=='acquisition'&&(selected.locale||selected.medium||selected.content))throw new AnalyticsError('ANALYTICS_FILTER_INVALID');return rpc('analytics_report',{p_environment:environment,p_view:view,p_filters:selected});}
 async function createReport({actorUserId,body}={}){
  if(!UUID.test(actorUserId)||!body||!VIEWS.has(body.view)||!['csv','html'].includes(body.format))throw new AnalyticsError('ANALYTICS_REPORT_INVALID');
  const selected=filters(body.filters);if(body.view!=='acquisition'&&(selected.locale||selected.medium||selected.content))throw new AnalyticsError('ANALYTICS_FILTER_INVALID');
  return rpc('analytics_create_report',{p_environment:environment,p_actor_user_id:actorUserId,p_view:body.view,p_format:body.format,p_filters:selected});
 }
 async function reportRow({actorUserId,id}={}){
  if(!UUID.test(actorUserId)||!UUID.test(id))throw new AnalyticsError('ANALYTICS_REPORT_INVALID');
  const result=await db.from('analytics_report_jobs').select('*').eq('id',id).eq('actor_user_id',actorUserId).eq('environment',environment).maybeSingle();
  if(result.error)throw new AnalyticsError('ANALYTICS_DATABASE_UNAVAILABLE',503);
  if(!result.data)throw new AnalyticsError('ANALYTICS_REPORT_NOT_FOUND',404);
  if(new Date(result.data.expires_at)<=clock())throw new AnalyticsError('ANALYTICS_REPORT_EXPIRED',410);
  return result.data;
 }
 async function getReport(input){const {snapshot,...row}=await reportRow(input);return row;}
 async function listReports({actorUserId,page=1,pageSize=25}={}){
  if(!UUID.test(actorUserId)||!Number.isInteger(page)||page<1||page>10000||!Number.isInteger(pageSize)||pageSize<1||pageSize>100)throw new AnalyticsError('ANALYTICS_REPORT_INVALID');
  const result=await db.from('analytics_report_jobs').select('id,status,view,created_at,expires_at,watermark,filters,metric_version',{count:'exact'})
   .eq('actor_user_id',actorUserId).eq('environment',environment).order('created_at',{ascending:false}).range((page-1)*pageSize,page*pageSize-1);
  if(result.error)throw new AnalyticsError('ANALYTICS_DATABASE_UNAVAILABLE',503);
  return {items:(result.data||[]).map(row=>({...row,completed_at:row.created_at})),total:result.count||0,page,pageSize};
 }
 async function downloadReport(input){
  const row=await reportRow(input),snap=row.snapshot,columns=[...new Set(snap.rows.flatMap(Object.keys))];let content;
  const metadata=[['view',row.view],['watermark',snap.watermark],['metric_version',snap.metric_version],['filters',snap.filters],['notes',snap.notes]];
  if(row.format==='csv')content='\ufeff'+[...metadata,[...columns],...snap.rows.map(x=>columns.map(k=>x[k]))].map(line=>line.map(csvCell).join(',')).join('\r\n');
  else content='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Nordic 用户分析报告</title><style>body{font:14px system-ui;color:#24312b;margin:32px}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d7ded5;padding:8px;text-align:left}pre{white-space:pre-wrap}@media print{button{display:none}}</style><h1>Nordic 用户分析报告</h1>'+metadata.map(([k,v])=>'<p><strong>'+htmlEscape(k)+'</strong>: '+htmlEscape(typeof v==='object'?JSON.stringify(v):v)+'</p>').join('')+'<table><thead><tr>'+columns.map(k=>'<th>'+htmlEscape(k)+'</th>').join('')+'</tr></thead><tbody>'+snap.rows.map(x=>'<tr>'+columns.map(k=>'<td>'+htmlEscape(x[k])+'</td>').join('')+'</tr>').join('')+'</tbody></table></html>';
  return {content,filename:'nordic-analytics-'+row.view+'-'+row.id+'.'+row.format,contentType:row.format==='csv'?'text/csv;charset=utf-8':'text/html;charset=utf-8'};
 }
 async function maintenance(){if(!enabled)return{disabled:true};return rpc('analytics_maintenance',{p_environment:environment});}
 return {setConsent,getConsent,ingest,report,createReport,getReport,listReports,downloadReport,maintenance};
}
module.exports={createAnalyticsService,AnalyticsError,csvCell};
