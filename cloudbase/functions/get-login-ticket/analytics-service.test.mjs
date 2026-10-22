import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateEvent } = require('./analytics-schema.cjs');
const { createAnalyticsService, AnalyticsError, csvCell } = require('./analytics-service.cjs');
const aid='11111111-1111-4111-8111-111111111111', rev='22222222-2222-4222-8222-222222222222';
const now=new Date('2026-10-21T03:00:00Z');
const event=(overrides={})=>({event_id:aid,event_name:'screen_view',schema_version:1,occurred_at:now.toISOString(),session_id:aid,anonymous_id:aid,consent_revision:rev,platform:'android',app_version:'1.2.0',build_code:1,page_key:'profile',properties:{},...overrides});
test('strict dictionary rejects server authority and content-bearing fields',()=>{
 assert.equal(validateEvent(event(),now).reason,undefined);
 assert.equal(validateEvent(event({event_name:'meal_saved'}),now).reason,'SERVER_EVENT_ONLY');
 assert.equal(validateEvent(event({properties:{email:'private@example.com'}}),now).reason,'UNKNOWN_PROPERTY');
 assert.equal(validateEvent(event({user_id:aid}),now).reason,'UNKNOWN_FIELD');
 assert.equal(validateEvent(event({occurred_at:'2026-10-22T03:00:00Z'}),now).reason,'TIMESTAMP_OUT_OF_RANGE');
});
test('ingestion binds environment, identity, revision and only sends validated fields',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {data:name==='analytics_set_consent'?{consent_revision:rev,analytics:true,diagnostics:false,actor_key:'actor'}:{results:[{event_id:aid,status:'accepted'}]}};}};
 const service=createAnalyticsService({db,environment:'dev',secret:'a'.repeat(32),now:()=>now});
 const consent=await service.setConsent({body:{anonymous_id:aid,platform:'android',analytics:true,diagnostics:false}});
 const batch=await service.ingest({body:{collection_token:consent.collection_token,events:[event()]}});
 assert.equal(batch.results[0].status,'accepted');
 assert.equal(calls.at(-1).name,'analytics_ingest');
 const prod=createAnalyticsService({db,environment:'prod',secret:'a'.repeat(32),now:()=>now});
 await assert.rejects(()=>prod.ingest({body:{collection_token:consent.collection_token,events:[event()]}}),e=>e instanceof AnalyticsError&&e.code==='ANALYTICS_CREDENTIAL_INVALID');
 const logged=await service.setConsent({userId:aid,body:{anonymous_id:aid,platform:'android',analytics:true,diagnostics:false}});
 await assert.rejects(()=>service.ingest({body:{collection_token:logged.collection_token,events:[event()]}}),e=>e.code==='ANALYTICS_IDENTITY_MISMATCH');
});
test('safe partial rejection cannot promote invalid events and disabled collection never writes',async()=>{
 const calls=[];const db={rpc:async(name,args)=>{calls.push({name,args});return{data:name==='analytics_set_consent'?{consent_revision:rev,analytics:true,diagnostics:false,actor_key:'actor'}:{results:[]}};}};
 const s=createAnalyticsService({db,environment:'dev',secret:'s'.repeat(32),now:()=>now});
 const c=await s.setConsent({body:{anonymous_id:aid,platform:'web',analytics:true,diagnostics:false}});
 const result=await s.ingest({body:{collection_token:c.collection_token,events:[event({platform:'web',event_name:'meal_saved'})]}});
 assert.equal(result.results[0].reason,'SERVER_EVENT_ONLY');assert.equal(calls.length,1);
 const off=createAnalyticsService({db,environment:'dev',secret:'s'.repeat(32),enabled:false});
 assert.equal((await off.ingest({body:{}})).disabled,true);assert.equal(calls.length,1);
});
test('CSV formula escaping includes whitespace and HTML-looking fields remain ordinary data',()=>{
 assert.equal(csvCell(' =SUM(A1)'), '"\' =SUM(A1)"');assert.equal(csvCell('a"b'), '"a""b"');
});
test('report validates ranges and calls SQL aggregate once instead of capped row scan',async()=>{
 const calls=[];const s=createAnalyticsService({db:{rpc:async(name,args)=>{calls.push({name,args});return{data:{rows:[],total:0,summary:{},series:[]}};}},environment:'dev',secret:'s'.repeat(32),now:()=>now});
 await assert.rejects(()=>s.report({view:'overview',from:'2026-10-22',to:'2026-10-21'}),e=>e.code==='ANALYTICS_FILTER_INVALID');
 await s.report({view:'overview',from:'2026-10-01',to:'2026-10-21'});
 assert.equal(calls.length,1);assert.equal(calls[0].name,'analytics_report');
});
test('expired credentials, forged identity, and raw content are rejected before DB writes',async()=>{
 let writes=0;let time=now;
 const s=createAnalyticsService({db:{rpc:async()=>{writes++;return{data:{consent_revision:rev,analytics:true,diagnostics:false,actor_key:'actor',expires_at:new Date(+now+60000).toISOString()}};}},environment:'dev',secret:'s'.repeat(32),now:()=>time});
 const c=await s.setConsent({body:{anonymous_id:aid,platform:'android',analytics:true,diagnostics:false}});
 time=new Date(+now+60001);
 await assert.rejects(()=>s.ingest({body:{collection_token:c.collection_token,events:[event()]}}),e=>e.code==='ANALYTICS_CREDENTIAL_INVALID');
 assert.equal(writes,1);
 assert.equal(validateEvent(event({properties:{content:'meal photo'}}),now).reason,'UNKNOWN_PROPERTY');
 assert.equal(validateEvent(event({source:'server'}),now).reason,'UNKNOWN_FIELD');
});
test('DB consent revocation is not confused with a network failure or successful ingestion',async()=>{
 let op=0;const s=createAnalyticsService({db:{rpc:async()=>++op===1?{data:{consent_revision:rev,analytics:true,diagnostics:false,actor_key:'actor'}}:{error:{message:'ANALYTICS_CONSENT_REVOKED'}}},environment:'dev',secret:'s'.repeat(32),now:()=>now});
 const c=await s.setConsent({body:{anonymous_id:aid,platform:'android',analytics:true,diagnostics:false}});
 await assert.rejects(()=>s.ingest({body:{collection_token:c.collection_token,events:[event()]}}),e=>e.code==='ANALYTICS_CONSENT_REVOKED'&&e.status===403);
});
test('diagnostic fields require diagnostic categorization and bounded context',()=>{
 assert.equal(validateEvent(event({event_name:'google_credential_result',properties:{outcome:'failed',stage:'native_callback',error_type:'GetCredentialUnknownException'}}),now).diagnostic,true);
 assert.equal(validateEvent(event({page_key:'https://private.example/x'}),now).reason,'CONTEXT_INVALID');
 assert.equal(validateEvent(event({app_version:''}),now).reason,'CONTEXT_INVALID');
 assert.equal(validateEvent(event({event_name:'native_diagnostic',properties:{error_type:'https://private.example/?token=secret'}}),now).reason,'PROPERTY_INVALID');
});
test('website attribution accepts only registered medium and content values',()=>{
 const web=properties=>event({platform:'web',event_name:'web_page_view',page_key:'home',properties});
 assert.equal(validateEvent(web({channel:'xiaohongshu',campaign:'launch',medium:'social',content:'launch_1'}),now).reason,undefined);
 assert.equal(validateEvent(web({medium:'paid-social'}),now).reason,'PROPERTY_INVALID');
 assert.equal(validateEvent(web({content:'private_search_term'}),now).reason,'PROPERTY_INVALID');
 assert.equal(validateEvent(web({utm_source:'xiaohongshu'}),now).reason,'UNKNOWN_PROPERTY');
});
test('account preference alone does not grant a fresh device collection',async()=>{
 const db={rpc:async()=>({data:{consent_revision:rev,analytics:true,diagnostics:true}})};
 const s=createAnalyticsService({db,environment:'dev',secret:'s'.repeat(32),now:()=>now});
 assert.deepEqual(await s.getConsent({userId:aid}),{analytics:false,diagnostics:false,account_analytics:true,account_diagnostics:true,device_grant:false});
});
test('report history is paginated and contains only the requesting admin jobs',async()=>{
 const checks=[];const query={select(columns,options){checks.push({columns,options});return this;},eq(key,value){checks.push({key,value});return this;},order(){return this;},range(from,to){checks.push({from,to});return Promise.resolve({data:[{id:aid,view:'overview',status:'completed',created_at:now.toISOString(),expires_at:'2026-10-20T03:00:00Z',metric_version:'1'}],count:1});}};
 const s=createAnalyticsService({db:{rpc:async()=>({data:{}}),from:()=>query},environment:'dev',secret:'s'.repeat(32),now:()=>now});
 const listed=await s.listReports({actorUserId:aid,page:2,pageSize:5});
 assert.deepEqual(checks.find(x=>x.key==='actor_user_id'),{key:'actor_user_id',value:aid});
 assert.deepEqual(checks.find(x=>x.from!==undefined),{from:5,to:9});
 assert.equal(listed.total,1);assert.equal(listed.items[0].metric_version,'1');assert.equal('snapshot' in listed.items[0],false);assert.equal(checks[0].columns.includes('snapshot'),false);assert.equal(checks[0].columns.includes('format'),true);
});
test('web attribution filters are exact and only accepted on acquisition',async()=>{
 const calls=[];const s=createAnalyticsService({db:{rpc:async(name,args)=>{calls.push(args);return{data:{rows:[]}};}},environment:'dev',secret:'s'.repeat(32),now:()=>now});
 await s.report({view:'acquisition',medium:'social',content:'launch_1',locale:'zh-CN'});
 assert.equal(calls[0].p_filters.medium,'social');
 await assert.rejects(()=>s.report({view:'overview',medium:'social'}),e=>e.code==='ANALYTICS_FILTER_INVALID');
 await assert.rejects(()=>s.report({view:'acquisition',content:'user_input'}),e=>e.code==='ANALYTICS_FILTER_INVALID');
});
