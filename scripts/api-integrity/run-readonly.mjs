import assert from "node:assert/strict";
import { readApiTestConfig } from "./config.mjs";
import { buildApiRequest, callApi } from "./http-client.mjs";

const config = readApiTestConfig();
const cases = [
  { name: "CORS 预检", path: "/foods/categories", method: "OPTIONS", expectedStatus: 204 },
  { name: "未认证账号读取被拒绝", path: "/account", method: "GET", expectedStatus: 401 },
  { name: "未知路径返回 404", path: "/api-integrity-does-not-exist", method: "GET", expectedStatus: 404 },
  { name: "登录请求缺少 code 被安全拒绝", path: "/", method: "POST", body: {}, expectedStatus: 400 },
];

const results = [];
for (const item of cases) {
  const request = buildApiRequest({ baseUrl: config.apiBaseUrl, ...item, token: null });
  const result = await callApi(request);
  assert.equal(result.status, item.expectedStatus, `${item.name}: unexpected response ${JSON.stringify(result.body)}`);
  results.push({ name: item.name, method: item.method, path: item.path, status: result.status, code: result.body?.code ?? null });
}

console.log(JSON.stringify({ apiBaseUrl: config.apiBaseUrl, mode: "live-readonly", results }, null, 2));
