# Coach Prompt Contract Implementation Plan

**Goal:** 将业务上下文显式映射为受白名单约束的 LLM APP_CONTEXT，并让流式与 JSON 教练共享同一份事实、安全和表达规则。

**Architecture:** 在 `deepseek-coach-service.cjs` 中新增纯函数，把内部业务 context 转成仅含 `userProfile` 和 `todayContext` 的模型 context；`buildMessages` 把该 context 嵌入 system message，历史对话保持最多十条真实 user/assistant 消息，最终用户问题保持原文。内部 `weekly` 保留在业务对象内但绝不进入模型输入。

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/deepseek-coach-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/deepseek-coach-service.test.mjs`
- Create: `docs/superpowers/specs/2026-08-15-coach-prompt-contracts-design.md`

### Task 1: Prompt contract tests

- [ ] 写失败测试，断言最终 system APP_CONTEXT 只含目标、偏好、今日目标/摄入/剩余/完成度/餐次数；不得泄漏 `weekly`、调试字段或不存在的身体/训练/餐食明细。
- [ ] 运行 `node --test cloudbase/functions/get-login-ticket/deepseek-coach-service.test.mjs`，确认因新映射和规则缺失而失败。

### Task 2: Shared prompt and allowlist mapping

- [ ] 新增共享基础规则、流式输出规则、JSON 输出规则和 `buildCoachLlmContext`。
- [ ] 将 APP_CONTEXT 放进唯一 system message；不改变请求模型、thinking disabled、历史上限、JSON mode 或 SSE 配置。
- [ ] 重跑目标测试至绿色。

### Task 3: Regression verification

- [ ] 运行 coach service / coach data service / HTTP function tests、Node 语法检查、Mini Program typecheck、lint、build:weapp 与 WXSS 校验。
- [ ] 检查 diff 只涉及 Prompt、契约测试和文档；不部署函数。
