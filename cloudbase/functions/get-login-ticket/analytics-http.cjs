// Analytics never enters the general trace/body logger or session-refresh path.
const { createHmac, timingSafeEqual, randomBytes } = require('node:crypto');
const DEV_ENV = 'test-dev-d4gyxnn0b5dfa2c8a';
const PROD_ENV = 'lewis-healthy-d4glgqqzv73a5bc10';
const MAX_BYTES = 64 * 1024;
function createGrantLimiter({now=Date.now,limit=120,maxKeys=1024}={}) {
  const salt=randomBytes(32); const buckets=new Map();
  return address => {
    const time=now();
    for (const [key,value] of buckets) if (value.until<=time) buckets.delete(key);
    const key=createHmac('sha256',salt).update(String(address || 'unknown')).digest('hex');
    let bucket=buckets.get(key);
    if (!bucket) {
      if (buckets.size>=maxKeys) return false;
      bucket={until:time+60000,count:0};buckets.set(key,bucket);
    }
    return ++bucket.count<=limit;
  };
}
const allowAnonymousGrant=createGrantLimiter();
function reply(res, status, data) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
  res.end(JSON.stringify(data));
}
function fail(code, status = 400) { return Object.assign(new Error(code), {code, status}); }
async function readBody(req, includeRaw = false) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw fail('ANALYTICS_INVALID_JSON');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BYTES) throw fail('ANALYTICS_REQUEST_TOO_LARGE', 413);
    chunks.push(chunk);
  }
  try {
    const value=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail('ANALYTICS_INVALID_JSON');
    return includeRaw ? {body:value,raw:Buffer.concat(chunks).toString('utf8')} : value;
  } catch { throw fail('ANALYTICS_INVALID_JSON'); }
}
function originAllowed(origin, environment) {
  if (!origin || origin === 'https://localhost' || origin === 'http://localhost' || origin === 'capacitor://localhost') return true;
  if (environment === DEV_ENV) return ['https://nutri-preview.lewislee.online','http://localhost:10086','http://127.0.0.1:10086','http://localhost:4173','http://127.0.0.1:4173'].includes(origin);
  return environment === PROD_ENV && origin === 'https://nutri.lewislee.online';
}
async function handleAnalyticsHttp({req,res,url,service}) {
  const path=url.pathname.replace(/^\/get-login-ticket(?=\/|$)/,'');
  const isCollection=/^\/analytics\/(?:consent|batch)$/.test(path);
  const isAdmin=path==='/api/admin/analytics/report' || /^\/api\/admin\/analytics\/reports(?:\/[a-zA-Z0-9_-]+(?:\/download)?)?$/.test(path);
  const isMaintenance=path==='/api/internal/analytics/maintenance';
  if (!isCollection && !isAdmin && !isMaintenance) return false;
  try {
    if (isMaintenance) {
      if (req.method!=='POST') throw fail('METHOD_NOT_ALLOWED',405);
      const timestamp=req.headers['x-analytics-timestamp'];
      const signature=req.headers['x-analytics-signature'];
      const secret=service.analyticsDispatchSecret;
      if (!secret || !/^\d{10}$/.test(String(timestamp)) || !/^[a-f0-9]{64}$/.test(String(signature))
          || Math.abs(Date.now()/1000-Number(timestamp))>120) throw fail('UNAUTHORIZED',401);
      const payload=await readBody(req,true);
      const expected=createHmac('sha256',secret).update(`${timestamp}\nPOST\n${path}\n${payload.raw}`).digest('hex');
      if (!timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) throw fail('UNAUTHORIZED',401);
      if (!service.analytics) throw fail('ANALYTICS_UNAVAILABLE',503);
      reply(res,200,await service.analytics.maintenance());
      return true;
    }
    const origin=req.headers.origin;
    if (!originAllowed(origin,service.analyticsEnvironment)) throw fail('ANALYTICS_ORIGIN_DENIED',403);
    if (req.method==='OPTIONS') {
      res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-Analytics-Collection','Cache-Control':'no-store'}); res.end(); return true;
    }
    let session=null;
    if (req.headers.authorization) {
      const token=/^Bearer (.+)$/.exec(req.headers.authorization)?.[1];
      try { session=token ? service.verifySession?.(token) : null; } catch { session=null; }
      if (!session?.sub) throw fail('UNAUTHORIZED',401);
    }
    if (isAdmin && session?.role!=='admin_console') throw fail('UNAUTHORIZED',401);
    if (isCollection && session?.role==='admin_console') throw fail('UNAUTHORIZED',401);
    if (isCollection && session?.sub && service.productUserExists && !await service.productUserExists(session.sub)) throw fail('UNAUTHORIZED',401);
    if (!service.analytics) throw fail('ANALYTICS_UNAVAILABLE',503);
    let result;
    if (isCollection) {
      if (path==='/analytics/consent' && req.method==='GET') {
        const collectionToken=req.headers['x-analytics-collection'];
        if (!session?.sub && (typeof collectionToken!=='string' || !collectionToken || collectionToken.length>4096)) throw fail('UNAUTHORIZED',401);
        result=await service.analytics.getConsent({userId:session?.sub || null,collectionToken,anonymousId:url.searchParams.get('anonymous_id'),platform:url.searchParams.get('platform')});
      } else {
        if (req.method!=='POST') throw fail('METHOD_NOT_ALLOWED',405);
        const body=await readBody(req);
        if (body.platform==='web' && !origin) throw fail('ANALYTICS_ORIGIN_DENIED',403);
        if (path==='/analytics/consent' && !session?.sub && !body.collection_token && !allowAnonymousGrant(req.socket?.remoteAddress)) throw fail('ANALYTICS_RATE_LIMITED',429);
        const method=path==='/analytics/consent' ? 'setConsent' : 'ingest';
        result=await service.analytics[method]({userId:session?.sub || null,body});
      }
    } else if (path==='/api/admin/analytics/report') {
      if (req.method!=='GET') throw fail('METHOD_NOT_ALLOWED',405);
      result=await service.analytics.report(Object.fromEntries(url.searchParams));
    } else if (path==='/api/admin/analytics/reports') {
      if (req.method==='POST') result=await service.analytics.createReport({actorUserId:session.sub,body:await readBody(req)});
      else if (req.method==='GET') result=await service.analytics.listReports({actorUserId:session.sub,page:Number(url.searchParams.get('page')||1),pageSize:Number(url.searchParams.get('pageSize')||25)});
      else throw fail('METHOD_NOT_ALLOWED',405);
    } else {
      if (req.method!=='GET') throw fail('METHOD_NOT_ALLOWED',405);
      const id=path.split('/')[5];
      if (path.endsWith('/download')) {
        const download=await service.analytics.downloadReport({actorUserId:session.sub,id});
        reply(res,200,download); return true;
      }
      result=await service.analytics.getReport({actorUserId:session.sub,id});
    }
    reply(res,200,result);
  } catch (error) {
    const code=typeof error?.code==='string' && /^(?:ANALYTICS_[A-Z_]+|UNAUTHORIZED|METHOD_NOT_ALLOWED)$/.test(error.code) ? error.code : 'ANALYTICS_UNAVAILABLE';
    const status=[400,401,403,404,405,409,410,413,429,503].includes(error?.status) ? error.status : code==='ANALYTICS_UNAVAILABLE'?503:400;
    if (status===429) res.setHeader('Retry-After','60');
    reply(res,status,{code});
  }
  return true;
}
module.exports={handleAnalyticsHttp,originAllowed,createGrantLimiter};
