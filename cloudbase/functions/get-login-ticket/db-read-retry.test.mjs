import assert from "node:assert/strict";
import test from "node:test";
import { withDbReadRetry } from "./db-read-retry.cjs";

test("retries one transient database read failure and returns the next result", async () => {
  let attempts = 0;
  const result = await withDbReadRetry(async () => {
    attempts += 1;
    return attempts === 1
      ? { data: null, error: { message: "connection timeout" } }
      : { data: [{ id: "ok" }], error: null };
  }, { delayMs: 0 });

  assert.equal(attempts, 2);
  assert.deepEqual(result.data, [{ id: "ok" }]);
  assert.equal(result.error, null);
});

test("does not retry a non-transient database error", async () => {
  let attempts = 0;
  const result = await withDbReadRetry(async () => {
    attempts += 1;
    return { data: null, error: { message: "column does not exist" } };
  }, { delayMs: 0 });

  assert.equal(attempts, 1);
  assert.equal(result.error.message, "column does not exist");
});

test('retries a transient read once and returns its result', async () => {
  let calls=0;
  const result=await withDbReadRetry(async()=>++calls===1?{error:{code:'08006'}}:{data:['ok']});
  assert.equal(calls,2);assert.deepEqual(result.data,['ok']);
});
test('never retries a persistent fault or a business/database permission error', async () => {
  for(const code of ['ECONNRESET','42501','P0001','23505']){
    let calls=0;
    const result=await withDbReadRetry(async()=>{calls++;return {error:{code}};});
    assert.equal(calls,code==='ECONNRESET'?2:1);assert.equal(result.error.code,code);
  }
});
test('handles thrown transport failures without retrying unknown failures', async()=>{
  let calls=0;
  assert.equal(await withDbReadRetry(async()=>{if(++calls===1)throw Object.assign(new Error('connection lost'),{code:'ETIMEDOUT'});return 'ok';}),'ok');
  await assert.rejects(()=>withDbReadRetry(async()=>{throw new Error('unknown');}),/unknown/);
});
