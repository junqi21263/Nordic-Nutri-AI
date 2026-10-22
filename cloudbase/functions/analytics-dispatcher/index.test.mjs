import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
const {dispatchOnce}=createRequire(import.meta.url)('./index.js');
test('signs only the expected environment endpoint and uses bounded request timeout',async()=>{
  let observed;
  const result=await dispatchOnce({endpoint:'https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com/get-login-ticket',environment:'test-dev-d4gyxnn0b5dfa2c8a',secret:'safe',now:()=>1700000000000,request:async(url,options)=>{observed={url,options};return {ok:true,json:async()=>({processed:0})};}});
  assert.deepEqual(result,{processed:0});
  assert.equal(observed.url,'https://test-dev-d4gyxnn0b5dfa2c8a.service.tcloudbase.com/get-login-ticket/api/internal/analytics/maintenance');
  assert.equal(observed.options.headers['x-analytics-signature'],createHmac('sha256','safe').update('1700000000\nPOST\n/api/internal/analytics/maintenance\n{}').digest('hex'));
  assert.ok(observed.options.signal);
});
test('refuses cross-environment targets, missing secrets, and non-HTTPS endpoints',async()=>{
  for (const endpoint of ['http://localhost','https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com/get-login-ticket','https://attacker.example/get-login-ticket']) {
    await assert.rejects(dispatchOnce({environment:'test-dev-d4gyxnn0b5dfa2c8a',endpoint,secret:'x'}),/ANALYTICS_DISPATCH_CONFIG/);
  }
});
