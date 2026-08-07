# NOVA Action-First Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the Mini Program NOVA coach page so a user sees today's status, one action, and current progress before secondary AI capabilities.

**Architecture:** Keep current daily-brief, summary, tip, quick-prompt, and chat contracts. Refactor only the Coach page hierarchy and SCSS: daily brief gains one CTA, progress owns tasks plus core metrics, and the daily tip becomes compact secondary content.

**Tech Stack:** Taro, React, TypeScript, SCSS, Vitest, WeChat Mini Program build.

---

### Task 1: Lock the action-first Coach contract

**Files:**
- Modify: `mini-program/tests/coach-proactive-daily-brief.test.ts`
- Modify: `mini-program/tests/coach-api-boundary.test.ts`

- [ ] **Step 1: Write the failing page-contract assertions**

```ts
expect(page).toContain("NOVA · 今日提醒");
expect(page).toContain("dailyBrief.greeting");
expect(page).toContain("dailyBrief.summary");
expect(page).toContain("dailyBrief.suggestion");
expect(page).toContain("记录第一餐");
expect(page).toContain("记录下一餐");
expect(page).toContain("今日进度");
expect(page).toContain("蛋白质");
expect(page).toContain("热量");
expect(page).toContain("NOVA 小贴士");
expect(page).toContain("新对话");
expect(page).toContain("我今天吃什么？");
expect(page).toContain("我的蛋白够吗？");
expect(page).toContain("下一餐怎么搭配？");
expect(page).not.toContain("重启对话");
```

- [ ] **Step 2: Verify it fails**

Run `pnpm --dir mini-program test:unit --run tests/coach-proactive-daily-brief.test.ts tests/coach-api-boundary.test.ts`.

Expected: FAIL because the current page still renders `今日营养建议` and `重启对话`, and lacks the record CTA and action-first prompts.

- [ ] **Step 3: Commit the red test**

Run `git add mini-program/tests/coach-proactive-daily-brief.test.ts mini-program/tests/coach-api-boundary.test.ts && git commit -m "test: define action-first nova coach layout"`.

### Task 2: Make the daily reminder the single primary surface

**Files:**
- Modify: `mini-program/src/pages/coach/index.tsx`

- [ ] **Step 1: Add derived record-action state near `proteinLeft`**

```ts
const hasMealRecord = summary.consumed.calories > 0;
const primaryActionLabel = hasMealRecord ? "记录下一餐" : "记录第一餐";
const primaryActionPrompt = hasMealRecord ? "我想记录今天的下一餐" : "我想记录今天的第一餐";
```

- [ ] **Step 2: Replace the hero toolbar and add one CTA after `dailyBrief.suggestion`**

```tsx
<View className="coach-chat__hero-toolbar">
  <Text className="coach-chat__hero-kicker">NOVA · 今日提醒</Text>
  <View className="coach-chat__restart-action" ariaLabel="新对话" onClick={() => void handleRestartConversation()}>
    <NordicIcon name="refresh-cw" size={15} ariaLabel="新对话" />
    <Text>新对话</Text>
  </View>
</View>
<Text className="coach-chat__hero-greeting">{dailyBrief.greeting}</Text>
<Text className="coach-chat__hero-summary">{dailyBrief.summary}</Text>
<Text className="coach-chat__hero-suggestion">{dailyBrief.suggestion}</Text>
<View className="coach-chat__hero-cta" onClick={() => void sendMessage(primaryActionPrompt)}>
  <Text>{primaryActionLabel}</Text>
  <NordicIcon name="arrow-right" size={16} ariaLabel={primaryActionLabel} />
</View>
```

- [ ] **Step 3: Change confirmation title to `新对话` and confirm text to `开启新对话`**

Preserve the reset request and message-history wording.

- [ ] **Step 4: Run Coach contract tests**

Run `pnpm --dir mini-program test:unit --run tests/coach-proactive-daily-brief.test.ts tests/coach-api-boundary.test.ts`.

Expected: PASS for reminder, CTA, and new-dialog assertions.

### Task 3: Combine tasks and progress while retaining core metrics

**Files:**
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Place the progress card directly after the hero**

Move the current progress card from `coach-chat__bottom-tools` to directly after `coach-chat__hero`. Rename its kicker to `今日进度` and retain the completion score.

- [ ] **Step 2: Keep protein and calories visible; expand carbohydrate only**

Use the existing `clampProgress`, `formatTargetStatus`, and `AnimatedProgressBar` renderer for protein/calories outside the expanded branch and carbohydrate inside it:

```tsx
const coreProgressRows = [
  ["蛋白质", summary.consumed.protein, summary.protein, "g"],
  ["热量", summary.consumed.calories, summary.calories, " kcal"],
] as const;
const detailProgressRows = [["碳水", summary.consumed.carbs, summary.carbs, "g"]] as const;
```

- [ ] **Step 3: Make the progress surface neutral**

Set `coach-chat__progress-card` to a white surface with subdued border. Keep task states compact and green; do not alter global tokens.

- [ ] **Step 4: Run validation**

Run `pnpm --dir mini-program typecheck && pnpm --dir mini-program test:unit --run tests/coach-proactive-daily-brief.test.ts tests/coach-api-boundary.test.ts tests/insight-api-boundary.test.ts`.

Expected: typecheck and selected tests pass.

### Task 4: Demote, but retain, tips and onboarding prompts

**Files:**
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Move the tip after progress and rename it**

Change `今日营养建议` to `NOVA 小贴士`. Always render its headline. Render content, `推荐原因`, and existing `heroPrompt` question only when expanded. Retain `loadDailyTip(true)` and `换一个建议`.

- [ ] **Step 2: Set the local quick-prompt fallback**

```ts
const defaultQuickPrompts = ["我今天吃什么？", "我的蛋白够吗？", "下一餐怎么搭配？"];
```

Retain server prompts when returned and the existing maximum of four chips.

- [ ] **Step 3: Apply low-emphasis tip styles**

Reduce padding and colour contrast for `coach-chat__suggestion`; use body-scale headline. Keep it visible after progress and before conversation.

- [ ] **Step 4: Re-run Coach tests**

Run `pnpm --dir mini-program test:unit --run tests/coach-proactive-daily-brief.test.ts tests/coach-api-boundary.test.ts`.

Expected: PASS with renamed tip, retained refresh control, and onboarding prompt assertions.

### Task 5: Validate and deliver the Mini Program view

**Files:**
- Verify: `mini-program/src/pages/coach/index.tsx`
- Verify: `mini-program/src/styles/page.scss`
- Verify: `mini-program/tests/coach-proactive-daily-brief.test.ts`
- Verify: `mini-program/tests/coach-api-boundary.test.ts`

- [ ] **Step 1: Run full automation**

Run `pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && git diff --check`.

Expected: all tests, types, build, mini-program verification, and whitespace checks pass.

- [ ] **Step 2: Check narrow mobile layout in WeChat Developer Tools**

Import `mini-program/dist/weapp/`, navigate to 教练, and verify: the first card has exactly one record CTA; today progress follows it with completion, tasks, protein and calories; the tip is visible but lower weight; quick prompts and the composer are reachable above the tab bar.

- [ ] **Step 3: Commit implementation**

Run `git add mini-program/src/pages/coach/index.tsx mini-program/src/styles/page.scss mini-program/tests/coach-proactive-daily-brief.test.ts mini-program/tests/coach-api-boundary.test.ts && git commit -m "feat: prioritize nova daily action"`.
