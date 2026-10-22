import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { handleAnalyticsHttp, createGrantLimiter } = require('./analytics-http.cjs');

async function withServer(run, overrides = {}) {
  const calls = [];
  const service = {
    analyticsEnvironment: 'test-dev-d4gyxnn0b5dfa2c8a',
    verifySession(token) { return token === 'admin' ? {sub:'a',role:'admin_console'} : token === 'user' ? {sub:'u',role:'user'} : null; },
    productUserExists: async () => true,
    analytics: {
      setConsent: async (input) => { calls.push(input); return {analytics:true}; },
      getConsent: async (input) => { calls.push(input); return {analytics:false}; },
      ingest: async (input) => { calls.push(input); return {results:[]}; },
      report: async (input) => { calls.push(input); return {rows:[],total:0}; },
      createReport: async (input) => { calls.push(input); return {id:'report'}; },
      listReports: async (input) => { calls.push(input); return {items:[],total:0,page:input.page,pageSize:input.pageSize}; },
      getReport: async (input) => { calls.push(input); return {id:input.id}; },
      downloadReport: async () => ({content:'\ufeffsafe,csv\n',contentType:'text/csv; charset=utf-8',filename:'report.csv'}),
    }, ...overrides,
  };
  const server = http.createServer(async (req,res) => {
    if (!await handleAnalyticsHttp({req,res,url:new URL(req.url,'http://localhost'),service})) { res.writeHead(404); res.end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try { await run(`http://127.0.0.1:${server.address().port}`,calls); }
  finally { server.closeAllConnections(); await new Promise(resolve=>server.close(resolve)); }
}
const json = body => ({method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});

test('unknown routes fall through; admin report requires admin_console',async()=>withServer(async(base,calls)=>{
  assert.equal((await fetch(`${base}/other`)).status,404);
  assert.equal((await fetch(`${base}/api/admin/analytics/report`)).status,401);
  assert.equal((await fetch(`${base}/api/admin/analytics/report`,{headers:{authorization:'Bearer user'}})).status,401);
  assert.equal(calls.length,0);
  assert.equal((await fetch(`${base}/get-login-ticket/api/admin/analytics/report?view=overview`,{headers:{authorization:'Bearer admin'}})).status,200);
}));
test('consent and batch preserve readonly authenticated identity without auth refresh',async()=>withServer(async(base,calls)=>{
  const options=json({anonymous_id:'random',platform:'android',analytics:true,diagnostics:false});
  options.headers.authorization='Bearer user';
  assert.equal((await fetch(`${base}/analytics/consent`,options)).status,200);
  assert.equal(calls[0].userId,'u');
  assert.equal((await fetch(`${base}/analytics/consent?platform=android&anonymous_id=random`,{headers:{authorization:'Bearer user'}})).status,200);
  assert.equal(calls[1].userId,'u');
  assert.equal((await fetch(`${base}/analytics/batch`,json({collection_token:'opaque',events:[]}))).status,200);
}));
test('invalid Bearer never silently downgrades to anonymous',async()=>withServer(async(base,calls)=>{
  const options=json({}); options.headers.authorization='Bearer invalid';
  assert.equal((await fetch(`${base}/analytics/consent`,options)).status,401);
  assert.equal(calls.length,0);
}));
test('collection origin allowlist and methods fail closed',async()=>withServer(async(base,calls)=>{
  const options=json({}); options.headers.origin='https://attacker.example';
  assert.equal((await fetch(`${base}/analytics/consent`,options)).status,403);
  options.headers.origin='https://nutri-preview.lewislee.online';
  assert.equal((await fetch(`${base}/analytics/consent`,options)).status,200);
  options.headers.origin='https://nutri.lewislee.online';
  assert.equal((await fetch(`${base}/analytics/consent`,options)).status,403);
  assert.equal((await fetch(`${base}/analytics/batch`)).status,405);
  assert.equal(calls.length,1);
}));
test('DEV admin hosting origin can read admin reports but cannot use collection routes',async()=>withServer(async(base,calls)=>{
  const origin='https://test-dev-d4gyxnn0b5dfa2c8a-1420560890.tcloudbaseapp.com';
  assert.equal((await fetch(`${base}/api/admin/analytics/report?view=overview`,{headers:{origin,authorization:'Bearer admin'}})).status,200);
  assert.equal((await fetch(`${base}/analytics/consent`,{...json({anonymous_id:'random',platform:'web',analytics:true,diagnostics:false}),headers:{origin,'content-type':'application/json'}})).status,403);
  assert.equal((await fetch(`${base}/api/admin/analytics/report?view=overview`,{headers:{origin:'https://test-dev-d4gyxnn0b5dfa2c8a.tcloudbaseapp.com',authorization:'Bearer admin'}})).status,403);
  assert.equal(calls.length,1);
}));
test('invalid JSON and oversized bodies are safely rejected',async()=>withServer(async(base,calls)=>{
  const options=json({}); options.body='{broken';
  assert.equal((await fetch(`${base}/analytics/batch`,options)).status,400);
  options.body=JSON.stringify({data:'x'.repeat(66*1024)});
  assert.equal((await fetch(`${base}/analytics/batch`,options)).status,413);
  assert.equal(calls.length,0);
}));
test('service errors never echo secrets and downloads are guarded',async()=>withServer(async(base)=>{
  const response=await fetch(`${base}/analytics/consent`,json({}));
  assert.equal(response.status,503); assert.equal((await response.text()).includes('secret-value'),false);
  assert.equal((await fetch(`${base}/api/admin/analytics/reports/id/download`)).status,401);
},{analytics:{setConsent:async()=>{throw new Error('secret-value');}}}));

test('maintenance requires fresh signature and is independent of product requests',async()=>withServer(async(base,calls)=>{
  const path='/api/internal/analytics/maintenance';
  assert.equal((await fetch(base+path,json({}))).status,401);
  const timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256','maintenance-secret').update(`${timestamp}\nPOST\n${path}\n{}`).digest('hex');
  const options=json({});
  options.headers['x-analytics-timestamp']=timestamp; options.headers['x-analytics-signature']=signature;
  assert.equal((await fetch(base+path,options)).status,200);
},{analyticsDispatchSecret:'maintenance-secret',analytics:{maintenance:async()=>({projected:0})}}));

test('anonymous consent reads require collection proof in header, never query credentials',async()=>withServer(async(base,calls)=>{
  assert.equal((await fetch(`${base}/analytics/consent?collection_token=secret`)).status,401);
  assert.equal((await fetch(`${base}/analytics/consent?anonymous_id=random&platform=web`,{headers:{'x-analytics-collection':'signed-own-grant'}})).status,200);
  assert.equal(calls[0].collectionToken,'signed-own-grant');
}));

test('anonymous grant limiter is bounded, ephemeral and does not trust proxy headers',()=>{
  let time=0; const allow=createGrantLimiter({now:()=>time,limit:2,maxKeys:1});
  assert.equal(allow('socket-a'),true);assert.equal(allow('socket-a'),true);assert.equal(allow('socket-a'),false);
  assert.equal(allow('socket-b'),false);time=60001;assert.equal(allow('socket-b'),true);
});
test('report history is admin-only and paginated at the route',async()=>withServer(async(base,calls)=>{
 assert.equal((await fetch(`${base}/api/admin/analytics/reports?page=2&pageSize=5`)).status,401);
 const response=await fetch(`${base}/api/admin/analytics/reports?page=2&pageSize=5`,{headers:{authorization:'Bearer admin'}});
 assert.equal(response.status,200);assert.deepEqual(await response.json(),{items:[],total:0,page:2,pageSize:5});
 assert.equal(calls[0].actorUserId,'a');
}));
