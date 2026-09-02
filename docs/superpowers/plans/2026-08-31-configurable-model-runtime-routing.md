# Configurable Model Runtime Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every AI-backed Nordic Nutri feature resolve its primary and fallback provider/model binding from the admin model-routing configuration at runtime.

**Architecture:** Add a capability-aware resolver backed by `ai_model_configs` and encrypted provider credentials. Text, vision, and image generation use separate adapter registries; existing feature prompts, response validators, and business persistence remain unchanged. The legacy environment-variable path remains a narrowly-scoped bootstrap fallback only until a compatible routed model is configured.

**Tech Stack:** Node.js CommonJS, CloudBase HTTP Function, CloudBase PostgreSQL via `app.rdb()`, Node test runner.

---

### Task 1: Define feature and capability routing contracts

**Files:**
- Create: `cloudbase/functions/get-login-ticket/model-routing-contract.cjs`
- Create: `cloudbase/functions/get-login-ticket/model-routing-contract.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/ai-model-config-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/ai-model-config-service.test.mjs`

- [ ] **Step 1: Write failing contract tests**

```js
import { featureCapability, normalizeCapabilities } from "./model-routing-contract.cjs";
assert.equal(featureCapability("coach"), "text");
assert.equal(featureCapability("food_recognition"), "vision");
assert.equal(featureCapability("food_image_generation"), "image_generation");
assert.deepEqual(normalizeCapabilities(["text", "vision", "text"]), ["text", "vision"]);
```

- [ ] **Step 2: Run the contract test and verify it fails because the module is absent**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/model-routing-contract.test.mjs`

- [ ] **Step 3: Implement the immutable feature-to-capability map and validate `metadata.capabilities`**

```js
const FEATURE_CAPABILITIES = Object.freeze({ coach: "text", daily_insight: "text", weekly_review: "text", nutrition_plan: "text", daily_tip: "text", proactive_daily_brief: "text", meal_analysis: "text", meal_evaluation: "text", meal_insight: "text", food_query_translation: "text", food_recognition: "vision", food_image_generation: "image_generation" });
```

- [ ] **Step 4: Re-run the contract and configuration tests**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/model-routing-contract.test.mjs cloudbase/functions/get-login-ticket/ai-model-config-service.test.mjs`

### Task 2: Resolve effective bindings and credentials at runtime

**Files:**
- Create: `cloudbase/functions/get-login-ticket/model-route-resolver.cjs`
- Create: `cloudbase/functions/get-login-ticket/model-route-resolver.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/ai-provider-catalog-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/ai-provider-catalog-service.test.mjs`

- [ ] **Step 1: Write failing resolver tests for primary, fallback, disabled, and incompatible models**

```js
const route = await resolver.resolve({ feature: "daily_insight" });
assert.equal(route.providerKey, "qwen");
assert.equal(route.modelKey, "qwen3-vl-flash");
assert.equal(route.role, "primary");
await assert.rejects(() => resolver.resolve({ feature: "food_image_generation" }), { code: "MODEL_ROUTE_NOT_CONFIGURED" });
```

- [ ] **Step 2: Run resolver tests and verify they fail because the resolver is absent**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/model-route-resolver.test.mjs`

- [ ] **Step 3: Implement resolver reads from `ai_model_configs`, capability filtering, deterministic primary/fallback selection, and server-only credential lookup**

The resolver returns only `{ feature, capability, providerKey, modelKey, displayName, baseUrl, endpoint, protocol, timeoutMs, maxTokens, temperature, role, credential }`; it must never return this object through an HTTP route or write the credential to observability.

- [ ] **Step 4: Re-run resolver and credential tests**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/model-route-resolver.test.mjs cloudbase/functions/get-login-ticket/ai-provider-catalog-service.test.mjs`

### Task 3: Add provider adapter registries

**Files:**
- Create: `cloudbase/functions/get-login-ticket/text-model-adapter-registry.cjs`
- Create: `cloudbase/functions/get-login-ticket/text-model-adapter-registry.test.mjs`
- Create: `cloudbase/functions/get-login-ticket/image-model-adapter-registry.cjs`
- Create: `cloudbase/functions/get-login-ticket/image-model-adapter-registry.test.mjs`

- [ ] **Step 1: Write failing adapter tests for OpenAI-compatible completion, streaming, and Hunyuan image generation**

```js
const client = createTextAdapter(route, { fetchImpl });
const result = await client.complete({ messages: [{ role: "user", content: "{}" }] });
assert.equal(result.text, '{"ok":true}');
assert.equal(result.model, "configured-model");
```

- [ ] **Step 2: Run adapter tests and verify expected missing-module failures**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/text-model-adapter-registry.test.mjs cloudbase/functions/get-login-ticket/image-model-adapter-registry.test.mjs`

- [ ] **Step 3: Implement adapters without vendor literals in business services**

Implement an OpenAI-compatible text/vision transport using configured endpoint/base URL, a CloudBase managed-text adapter only for registered managed models, and an image adapter registry whose initial implementation wraps the existing Hunyuan image service. Unsupported capability/provider pairs must fail as `MODEL_ADAPTER_UNSUPPORTED`.

- [ ] **Step 4: Re-run adapter tests**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/text-model-adapter-registry.test.mjs cloudbase/functions/get-login-ticket/image-model-adapter-registry.test.mjs`

### Task 4: Migrate all text features to dynamic routing

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/deepseek-coach-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/daily-insight-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/deepseek-weekly-review-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/deepseek-nutrition-plan-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/daily-tip-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/proactive-daily-brief-service.cjs`
- Modify: matching `*.test.mjs` files

- [ ] **Step 1: Add failing integration tests that inject a configured route instead of `DEEPSEEK_API_KEY`**

```js
const runtime = createRuntimeService(envWithoutDeepseek, { modelRouteResolver: resolverWithQwenRoute, fetchImpl });
const result = await runtime.coach.answer({ context, question: "晚餐怎么搭配？" });
assert.equal(result.model, "qwen3-vl-flash");
```

- [ ] **Step 2: Run each focused service test and confirm it fails on the old fixed-key dependency**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/deepseek-coach-service.test.mjs cloudbase/functions/get-login-ticket/daily-insight-service.test.mjs cloudbase/functions/get-login-ticket/deepseek-weekly-review-service.test.mjs cloudbase/functions/get-login-ticket/deepseek-nutrition-plan-service.test.mjs cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs cloudbase/functions/get-login-ticket/proactive-daily-brief-service.test.mjs`

- [ ] **Step 3: Inject routed completion/stream clients while preserving prompt and schema validators**

Each service receives a generic completion client; `index.js` resolves the configured binding immediately before execution, records only model/provider/usage, and uses the existing legacy service only when no configured route exists during the migration window.

- [ ] **Step 4: Run focused text tests**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/deepseek-coach-service.test.mjs cloudbase/functions/get-login-ticket/daily-insight-service.test.mjs cloudbase/functions/get-login-ticket/deepseek-weekly-review-service.test.mjs cloudbase/functions/get-login-ticket/deepseek-nutrition-plan-service.test.mjs cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs cloudbase/functions/get-login-ticket/proactive-daily-brief-service.test.mjs`

### Task 5: Consolidate vision and food-image routing

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/vision-provider-router.cjs`
- Modify: `cloudbase/functions/get-login-ticket/vision-adapter-registry.cjs`
- Modify: `cloudbase/functions/get-login-ticket/hunyuan-image-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: matching vision/image tests

- [ ] **Step 1: Write failing tests proving the common resolver supplies both vision and image bindings**

```js
assert.equal((await resolver.resolve({ feature: "food_recognition" })).capability, "vision");
assert.equal((await resolver.resolve({ feature: "food_image_generation" })).capability, "image_generation");
```

- [ ] **Step 2: Run the vision/image focused tests and verify they fail before migration**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/vision-provider-router.test.mjs cloudbase/functions/get-login-ticket/vision-adapter-registry.test.mjs`

- [ ] **Step 3: Delegate effective binding selection to the common resolver**

Keep existing DeepSeek/Qwen vision request formatting and Hunyuan image prompt/download/persistence chain intact. Only model selection and adapter construction move behind the common registry; image routes require `image_generation` capability.

- [ ] **Step 4: Re-run vision/image tests**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/vision-provider-router.test.mjs cloudbase/functions/get-login-ticket/vision-adapter-registry.test.mjs cloudbase/functions/get-login-ticket/deepseek-vision-service.test.mjs cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs`

### Task 6: Make admin and observability show effective routes

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/ai-model-config-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/ai-provider-catalog-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: relevant admin and observability tests

- [ ] **Step 1: Write failing tests for capability-aware admin output and safe runtime metadata**

```js
assert.deepEqual(saved.metadata.capabilities, ["text"]);
assert.equal(trace.provider, "qwen");
assert.equal(trace.model, "qwen3-vl-flash");
assert.equal(JSON.stringify(trace).includes("credential"), false);
```

- [ ] **Step 2: Run focused tests and verify expected failures**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/ai-model-config-service.test.mjs cloudbase/functions/get-login-ticket/ai-provider-catalog-service.test.mjs`

- [ ] **Step 3: Return capabilities and effective route status to authorized admin callers only; record sanitized provider/model/fallback metadata**

- [ ] **Step 4: Re-run focused admin tests**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/ai-model-config-service.test.mjs cloudbase/functions/get-login-ticket/ai-provider-catalog-service.test.mjs`

### Task 7: Verify and deploy only DEV

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js` only if test-discovered defects require it

- [ ] **Step 1: Run the entire function test suite with Node 24**

Run: `PATH=/opt/homebrew/opt/node@24/bin:$PATH node --test cloudbase/functions/get-login-ticket/*.test.mjs`

- [ ] **Step 2: Review changed files for credential or header leakage**

Run: `rg -n "process\.env|req\.headers|credential|apiKey" cloudbase/functions/get-login-ticket/model-route-resolver.cjs cloudbase/functions/get-login-ticket/*adapter*.cjs`

- [ ] **Step 3: Deploy `get-login-ticket` only to `test-dev-d4gyxnn0b5dfa2c8a` after function status and target are rechecked**

Use the CloudBase function-management tool with `functionName: "get-login-ticket"`, `functionRootPath: "/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions"`, and no production environment mutation.

- [ ] **Step 4: Invoke a DEV-only configured-model smoke case and inspect sanitized traces**

Acceptance: runtime trace reports the configured provider/model and no response contains credentials; legacy DeepSeek/Hunyuan flows remain available only as explicit fallback until all required admin routes are configured.
