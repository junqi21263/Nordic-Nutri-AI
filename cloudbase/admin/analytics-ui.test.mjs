import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const read = (file) => readFile(new URL(file,import.meta.url),'utf8');

test('admin analytics is mounted as a separate module using existing authenticated API', async () => {
  const page = await read('./food-images.html');
  assert.match(page,/data-module="analytics"/);
  assert.match(page,/id="moduleAnalytics"/);
  assert.match(page,/NordicAnalytics\?\.load/);
  assert.match(page,/type="module" src="\.\/analytics.js/);
  const module = await read('./analytics.js');
  assert.match(module,/api\(/);
  assert.doesNotMatch(module,/localStorage|Bearer|sessionToken|confirm\(/);
});
test('export download never passes credentials in URL and is manually initiated', async () => {
  const module = await read('./analytics.js');
  assert.match(module,/new Blob/);
  assert.match(module,/URL\.revokeObjectURL/);
  assert.match(module,/analyticsExportCsv/);
  assert.match(module,/analyticsExportHtml/);
  assert.doesNotMatch(module,/setInterval|mailto:|window\.open/);
});
test('expired report retry uses listed metadata because expired detail is unavailable', async () => {
  const module = await read('./analytics.js');
  assert.match(module,/Date\.parse\(item\.expires_at\) <= Date\.now\(\)/);
  assert.match(module,/state\.history\.get\(id\)/);
  assert.doesNotMatch(module,/const job = await api\(`\/analytics\/reports\/\$\{encodeURIComponent\(id\)\}`\)/);
});
