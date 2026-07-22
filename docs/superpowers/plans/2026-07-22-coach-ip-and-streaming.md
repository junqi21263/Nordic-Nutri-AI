# NOVA 教练 IP 与流式回复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为营养教练增加原创 NOVA 人物 IP，并通过 CloudBase HTTP 函数让合规 DeepSeek 回答实时分块呈现在小程序中。

**Architecture:** 保留 `/coach-answer` JSON 接口。新增认证后的 `/coach-answer/stream`：规则答案直接完成；合规饮食问题调用专用 DeepSeek 流式文本提示词、转发安全文本增量、完成后校验并持久化，随后输出 complete。小程序优先消费 NDJSON，读取失败时回退现有接口。NOVA 是本地组件，位于问候 Hero、教练消息与思考状态。

**Tech Stack:** Node.js 18 HTTP CloudBase Function、DeepSeek Chat Completions SSE、CloudBase PostgreSQL、Taro 4、React、WeChat 分块请求、Vitest、Node test runner、SCSS。

---

## 文件边界

- `cloudbase/functions/get-login-ticket/deepseek-coach-service.cjs`：DeepSeek SSE 请求与帧解析。
- `cloudbase/functions/get-login-ticket/coach-data-service.cjs`：用户作用域、幂等、规则拦截、完整持久化与流事件。
- `cloudbase/functions/get-login-ticket/index.js`：路由与 NDJSON 输出。
- `mini-program/src/api/coach-api.ts`：流事件类型和流请求。
- `mini-program/src/pages/coach/index.tsx`：临时流气泡、增量合并、普通 JSON 回退。
- `mini-program/src/components/coach-avatar/index.tsx` 与 `index.scss`：NOVA 本地头像与思考状态。
- `mini-program/src/styles/page.scss`：Hero、头像、建议/进度卡、流气泡样式；保持已修复的固定底部布局。

### Task 1: 定义并验证 DeepSeek 流服务

**Files:** Modify `cloudbase/functions/get-login-ticket/deepseek-coach-service.cjs` and `cloudbase/functions/get-login-ticket/deepseek-coach-service.test.mjs`.

- [ ] **Step 1: 写失败测试。** 在 `deepseek-coach-service.test.mjs` 添加 `requests DeepSeek SSE and emits parsed content deltas`：fake fetch 返回 `data: {"choices":[{"delta":{"content":"晚餐"}}]}\n\n` 和 `data: [DONE]\n\n`；断言请求 JSON 含 `stream: true`，并断言 `collect(createDeepseekCoachStreamService(...)(validInput))` 等于 `["晚餐"]`。

- [ ] **Step 2: 确认失败。** 运行 `node --test deepseek-coach-service.test.mjs`；预期因 `createDeepseekCoachStreamService` 未定义而 FAIL。

- [ ] **Step 3: 最小实现。** 新增 `createDeepseekCoachStreamService({ apiKey, model, fetchImpl })`，请求 `https://api.deepseek.com/chat/completions`，body 为既有 coach body 加 `stream: true`。新增 `readSseJson(body)`：使用 `TextDecoder` 和空行切帧，只解析 `data: {...}`，忽略 `[DONE]` 与空帧。服务仅 yield `payload?.choices?.[0]?.delta?.content` 的非空字符串；无 body、非 2xx 或解析错误抛 `PublicCoachError("COACH_RETRYABLE")`；不下发原始上游帧。

- [ ] **Step 4: 确认通过并提交。** 运行 `node --test deepseek-coach-service.test.mjs`，预期 PASS；执行 `git add cloudbase/functions/get-login-ticket/deepseek-coach-service.cjs cloudbase/functions/get-login-ticket/deepseek-coach-service.test.mjs && git commit -m "feat: stream DeepSeek coach output"`。

### Task 2: 将受约束流式文本校验后持久化

**Files:** Modify `cloudbase/functions/get-login-ticket/coach-data-service.cjs` and `cloudbase/functions/get-login-ticket/coach-data-service.test.mjs`.

- [ ] **Step 1: 写失败测试。** 添加 `streams a bounded nutrition text reply and persists only after completion`：注入 `streamAnswer: async function* () { yield "晚餐优先安排鸡胸肉和蔬菜。"; }`，调用 `collect(service.streamMessage("user-1", validRequest))`，断言事件类型是 `["delta", "complete"]`，并且 `coach_messages` 恰有一条 assistant 行。另添加非营养输入断言：没有调用 `streamAnswer`，只返回一条 `complete` 且 provider 是 `rule_v2`。

- [ ] **Step 2: 确认失败。** 运行 `node --test coach-data-service.test.mjs`；预期 `streamMessage is not a function`。

- [ ] **Step 3: 最小实现。** 扩展工厂参数为 `streamAnswer`，并新增 `streamMessage(userId, input)`。先 `normalizeInput`、`getPriorReply`、`buildContext`、`createRuleReply`；幂等键已有结果时只 yield `complete`。医疗风险、非营养输入和无流服务时，调用共享 `persistReply(userId, request, context, reply, source)` 并 yield `complete`。合规输入中把每个 `streamAnswer` chunk 立即 yield `{type:"delta",text}`，同时累积 `content`；完成后 `validateStreamedText(content)` 检查非空、500 字上限和安全词，再以可信 `createRuleReply` 作为 `answer` 摘要调用 `persistReply`。任何上游或校验异常都持久化 `rule_v2` 完整答案，不能留下未配对的用户消息。`sendMessage` 同样复用 `persistReply`。

- [ ] **Step 4: 确认通过并提交。** 运行 `node --test coach-data-service.test.mjs`，预期 PASS；执行 `git add cloudbase/functions/get-login-ticket/coach-data-service.cjs cloudbase/functions/get-login-ticket/coach-data-service.test.mjs && git commit -m "feat: persist validated coach stream replies"`。

### Task 3: 暴露认证 NDJSON 端点

**Files:** Modify `cloudbase/functions/get-login-ticket/index.js` and `cloudbase/functions/get-login-ticket/index.test.mjs`.

- [ ] **Step 1: 写失败测试。** 添加 `streams coach events only for an authenticated product user`：向 `POST /coach-answer/stream` 提交有效 bearer 和 body，断言 200、`content-type` 包含 `application/x-ndjson`，并且逐行 JSON 的 type 为 `["delta","complete"]`；无 bearer 断言 401。

- [ ] **Step 2: 确认失败。** 运行 `node --test index.test.mjs`；预期端点返回 404 或 405。

- [ ] **Step 3: 最小实现。** `getCoachRoute` 映射 `/coach-answer/stream` 至 `streamMessage`。在 `createHttpServer` 认证通过后处理 POST：先读取 JSON body，再写 `200`、`content-type: application/x-ndjson; charset=utf-8`、`cache-control: no-cache` 与既有 CORS；对 `service.coach.streamMessage(session.sub, body)` 的每个事件执行 `res.write(JSON.stringify(event) + "\n")`；结束后 `res.end()`。headers 写入前的错误走现有 JSON 错码；写入后的错误仅写 `{"type":"error","code":"COACH_SERVICE_UNAVAILABLE"}`，不输出堆栈或配置。

- [ ] **Step 4: 确认通过并提交。** 运行 `node --test index.test.mjs`，预期 PASS；执行 `git add cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs && git commit -m "feat: expose authenticated coach stream endpoint"`。

### Task 4: 建立 NOVA 原创头像与问候 Hero

**Files:** Create `mini-program/src/components/coach-avatar/index.tsx` and `mini-program/src/components/coach-avatar/index.scss`; modify `mini-program/src/pages/coach/index.tsx`, `mini-program/src/styles/page.scss`, and `mini-program/tests/coach-profile.test.ts`.

- [ ] **Step 1: 写失败测试。** 添加 `renders NOVA instead of the generic bot and shows a thinking state`：读取 coach 页面源码，断言有 `CoachAvatar` 和 `status="thinking"`，且没有 `name="bot"`。

- [ ] **Step 2: 确认失败。** 运行 `pnpm test:unit -- coach-profile.test.ts`；预期因为页面仍用 `NordicIcon name="bot"` 而 FAIL。

- [ ] **Step 3: 最小实现。** 新建 `CoachAvatar({status = "idle"})`，根节点 class 为 `coach-avatar coach-avatar--${status}`、`ariaLabel="NOVA 营养教练"`，内部使用项目内原创 NOVA 插画、发型、深绿针织上衣和思考点。教练页在标题/目标后增加问候 Hero：左侧文案“晚上好，我来帮你补齐今天的蛋白质”，右侧 NOVA，底部两项按钮“晚餐怎么补蛋白？”和“查看今日进度”。Hero 下保留消息区，并将建议卡、进度卡、快捷回复排列在输入区上方。SCSS 使用现有深绿、暖米白、圆角和阴影 token；不得使用外链或新增固定元素。

- [ ] **Step 4: 确认通过并提交。** 运行 `pnpm test:unit -- coach-profile.test.ts`，预期 PASS；执行 `git add mini-program/src/components/coach-avatar mini-program/tests/coach-profile.test.ts && git commit -m "feat: add NOVA coach avatar"`。

### Task 5: 接入 NDJSON 消费、建议卡和普通 JSON 回退

**Files:** Modify `mini-program/src/api/coach-api.ts`, `mini-program/src/pages/coach/index.tsx`, `mini-program/src/styles/page.scss`, `mini-program/tests/coach-api-boundary.test.ts`, and `mini-program/tests/coach-profile.test.ts`.

- [ ] **Step 1: 写失败测试。** 添加测试断言 `coach-api.ts` 导出 `streamProductCoachMessage`，页面包含临时 `id: \`stream-${requestId}\``、`event.type === "delta"`、`event.type === "complete"` 和既有 `sendProductCoachMessage`。

- [ ] **Step 2: 确认失败。** 运行 `pnpm test:unit -- coach-api-boundary.test.ts coach-profile.test.ts`；预期流 API 与临时气泡不存在。

- [ ] **Step 3: 最小实现。** 在 `coach-api.ts` 定义 `ProductCoachStreamEvent = {type:"delta";text:string} | {type:"complete";messages:ProductCoachMessage[];reply:ProductCoachReply} | {type:"error";code:string}` 和 `streamProductCoachMessage(prompt,date,onEvent)`。在专用流请求 helper 中使用 Taro/微信支持的分块回调累积 UTF-8 buffer，按换行 `JSON.parse` NDJSON 并调用 `onEvent`；基础库不支持或首个 delta 前失败时 reject。页面先添加用户消息与 `{id:streamId,role:"coach",content:"",streaming:true}`；delta 追加 content；complete 用服务端持久化 messages 替换。流失败移除临时消息并调用既有 `sendProductCoachMessage`。流气泡渲染 `CoachAvatar status="thinking"` 并在内容为空时显示 `NOVA 正在整理建议…`。建议卡复用已有希腊酸奶入餐动作；进度卡读取现有 summary 的蛋白、膳食纤维和饮水目标；样式新增 Hero、头像、卡片和文字间距，不能修改 `.coach-chat__score`、`.coach-chat__composer`、`.page-layout--coach-chat` 已修复的垂直定位。

- [ ] **Step 4: 确认通过并提交。** 运行 `pnpm test:unit -- coach-api-boundary.test.ts coach-profile.test.ts`，预期 PASS；执行 `git add mini-program/src/api/coach-api.ts mini-program/src/pages/coach/index.tsx mini-program/src/styles/page.scss mini-program/tests/coach-api-boundary.test.ts mini-program/tests/coach-profile.test.ts && git commit -m "feat: render streaming NOVA coach replies"`。

### Task 6: 全量验证、审查和发布

**Files:** Modify `docs/API_CONTRACT.md` to document `POST /coach-answer/stream` and NDJSON event types.

- [ ] **Step 1: 云函数验证。** 在 `cloudbase/functions/get-login-ticket` 运行 `node --test *.test.mjs`；预期全部 PASS。

- [ ] **Step 2: 小程序验证。** 在 `mini-program` 运行 `pnpm test:unit && pnpm typecheck && pnpm lint && pnpm format:check && pnpm build:weapp && pnpm verify:weapp`；预期全部 PASS。

- [ ] **Step 3: 安全审查。** 确认新流路由先验证 session；客户端没有用户 ID、DeepSeek Key 或系统提示词；未验证回答不入库；非饮食与医疗风险不调用模型；错误不暴露堆栈。

- [ ] **Step 4: 推送与发布。** 执行 `git add docs/API_CONTRACT.md && git commit -m "docs: describe coach stream endpoint" && git push origin codex/coach-backend-design`。用 CloudBase MCP 更新现有 `get-login-ticket` HTTP 函数，保持当前环境变量、网关和 30 秒超时不变。随后在微信开发者工具重新编译，人工验证营养问题逐段显示、非饮食问题不调用模型、医疗风险安全回退，以及评分条、输入框、TabBar 不重叠。
