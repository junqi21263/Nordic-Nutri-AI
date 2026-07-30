# Core AI Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Route core personalized nutrition reasoning through DeepSeek while keeping high-frequency auxiliary content on the dev Growth Plan Hunyuan Worker.

**Architecture:** `get-login-ticket` keeps the local deterministic calculations and DeepSeek-backed core services. The dev `hunyuan-image-worker` remains the provider for daily tips, quick prompts, and food-detail insights. Daily insight cache records use the active provider and context hash so switching providers does not cause regeneration on every request.

**Tech Stack:** Node.js CloudBase HTTP Function, CommonJS services, Node test runner, CloudBase PostgreSQL cache, Taro WeChat Mini Program.

---

### Task 1: Lock the provider split with regression tests

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/insight-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] Add a cache regression asserting a valid `deepseek` row with the same context hash is reused.
- [ ] Add a runtime assembly regression asserting daily insight uses the DeepSeek completion when `DEEPSEEK_API_KEY` is configured, while food insight still uses the signed Hunyuan worker.
- [ ] Run the focused tests and confirm the new assertions fail against the current Hunyuan-only daily-insight wiring.

### Task 2: Route the homepage insight to DeepSeek and preserve Hunyuan auxiliary routes

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/insight-data-service.cjs`

- [ ] Construct `dailyInsight` with `apiKey: env.DEEPSEEK_API_KEY`, `model: deepseekModel`, and `source: "deepseek"`, without passing the dev Worker completion.
- [ ] Keep `foodInsight` and `coach.dailyTip` wired to `nutritionContentWorker`, preserving `source: "hunyuan-exp"` and `HY_TEXT_MODEL` metadata.
- [ ] Remove the provider-switch rejection for valid same-day DeepSeek cache rows; continue invalidating legacy `cloudbase` rows so the previous `hy3` content is replaced once.

### Task 3: Verify local behavior and production packaging

**Files:**
- No new files.

- [ ] Run the complete CloudBase function test suite.
- [ ] Run `pnpm run typecheck:mini-program`.
- [ ] Run `pnpm --dir mini-program build:weapp`.
- [ ] Run `git diff --check` and syntax checks for modified JavaScript files.

### Task 4: Deploy and verify the main function

**Files:**
- No source files.

- [ ] Verify the current CloudBase target is the main environment before deployment.
- [ ] Update the main `get-login-ticket` function code with the existing main environment variables, including `DEEPSEEK_API_KEY` and `DEEPSEEK_MODEL`.
- [ ] Poll until the function is Active.
- [ ] Verify that dev Worker routes remain configured for daily tip, quick prompt, and food insight, and report that real WeChat runtime acceptance still requires a DevTools request.
