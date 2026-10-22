const {createHmac}=require('node:crypto');
const PATH='/api/internal/analytics/maintenance';
async function dispatchOnce({
  endpoint=process.env.ANALYTICS_DISPATCH_API_BASE_URL,
  environment=process.env.TCB_ENV || process.env.SCF_NAMESPACE,
  secret=process.env.ANALYTICS_DISPATCH_SECRET || process.env.AI_WORKER_SHARED_SECRET,
  now=Date.now,
  request=globalThis.fetch,
}={}) {
  if (!['test-dev-d4gyxnn0b5dfa2c8a','lewis-healthy-d4glgqqzv73a5bc10'].includes(environment)
      || endpoint!==`https://${environment}.service.tcloudbase.com/get-login-ticket` || !secret) {
    throw new Error('ANALYTICS_DISPATCH_CONFIG_INVALID');
  }
  const timestamp=String(Math.floor(now()/1000));
  const body='{}';
  const signature=createHmac('sha256',secret).update(`${timestamp}\nPOST\n${PATH}\n${body}`).digest('hex');
  const response=await request(endpoint+PATH,{
    method:'POST',body,signal:AbortSignal.timeout(45000),
    headers:{'content-type':'application/json','x-analytics-timestamp':timestamp,'x-analytics-signature':signature},
  });
  if (!response.ok) throw new Error(`ANALYTICS_DISPATCH_HTTP_${response.status}`);
  return response.json();
}
module.exports={main:async()=>dispatchOnce(),dispatchOnce};
