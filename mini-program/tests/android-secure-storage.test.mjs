import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('Keystore generates the encryption IV and writes durably before returning', () => {
  const source = readFileSync(new URL('../../android/app/src/main/java/com/lewislee/nordicnutri/SecureStorageBridge.java', import.meta.url), 'utf8');
  assert.match(source, /cipher\.init\(Cipher\.ENCRYPT_MODE, loadKey\(\)\);/);
  assert.match(source, /byte\[\] iv = cipher\.getIV\(\);/);
  assert.doesNotMatch(source, /new SecureRandom/);
  assert.match(source, /putString\(key, Base64\.encodeToString\(packed, Base64\.NO_WRAP\)\)\.commit\(\)/);
});
