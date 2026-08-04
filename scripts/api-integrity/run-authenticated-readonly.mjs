import assert from "node:assert/strict";
import { readApiTestConfig, requireProductTokens } from "./config.mjs";
import { buildApiRequest, callApi } from "./http-client.mjs";

const config = readApiTestConfig();
const { tokenA, tokenB } = requireProductTokens(config);
const today = new Date().toISOString().slice(0, 10);

async function requireOk(name, path, token, summarize) {
  const request = buildApiRequest({ baseUrl: config.apiBaseUrl, path, method: "GET", token });
  const result = await callApi(request, { timeoutMs: 20_000 });
  assert.equal(result.status, 200, `${name}: unexpected response ${JSON.stringify(result.body)}`);
  return { name, status: result.status, ...summarize(result.body) };
}

function countItems(body) {
  return { itemCount: Array.isArray(body?.items) ? body.items.length : null };
}

const results = [];
results.push(await requireOk("用户 A 账号读取", "/account", tokenA, () => ({ dataShape: "account" })));
results.push(await requireOk("用户 B 账号读取", "/account", tokenB, () => ({ dataShape: "account" })));
results.push(await requireOk("食品分类", "/foods/categories", tokenA, countItems));
results.push(await requireOk("食品标签", "/foods/tags", tokenA, countItems));
const discovery = await requireOk("食品推荐", "/foods/discover?limit=1&page=1", tokenA, countItems);
results.push(discovery);
results.push(await requireOk("当日餐食", `/meals?date=${today}`, tokenA, (body) => ({ itemCount: Array.isArray(body) ? body.length : null })));
results.push(await requireOk("每日营养汇总", `/meal-summary?date=${today}`, tokenA, (body) => ({ date: body?.date ?? null })));
results.push(await requireOk("周度复盘", `/weekly-review?date=${today}&preferFast=1`, tokenA, (body) => ({ startDate: body?.startDate ?? null })));
results.push(await requireOk("成就", `/achievements?date=${today}`, tokenA, (body) => ({ itemCount: Array.isArray(body) ? body.length : null })));

console.log(JSON.stringify({ apiBaseUrl: config.apiBaseUrl, mode: "live-authenticated-readonly", date: today, results }, null, 2));
