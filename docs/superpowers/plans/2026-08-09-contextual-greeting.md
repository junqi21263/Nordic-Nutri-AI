# Contextual Greeting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Use a single Shanghai-time-aware greeting rule so the home page and NOVA coach page show concise, appropriate weekday/weekend messages, including late-night and early-morning states.

**Architecture:** Keep `getCoachGreeting` as the only public interface consumed by both pages. Add a private Shanghai weekday helper beside the existing Shanghai-hour helper; the function will choose the short greeting from Shanghai local hour and whether the local date is Saturday or Sunday. The NOVA deep-night summary copy remains owned by the existing daily-brief content path and is outside this narrow greeting-layout change.

**Tech Stack:** TypeScript, Taro React, Vitest.

---

### Task 1: Define the shared weekday/weekend greeting contract

**Files:**
- Modify: `mini-program/tests/coach-greeting.test.ts`
- Modify: `mini-program/src/features/coach/server-time.ts`

- [ ] **Step 1: Write the failing tests**

Add these test cases to `mini-program/tests/coach-greeting.test.ts` after the afternoon assertion:

```ts
  it("uses a concise weekday early-morning greeting at 02:36 Shanghai time", () => {
    expect(getCoachGreeting("2026-08-06T18:36:00.000Z")).toBe("还没休息");
  });

  it("uses a concise weekend early-morning greeting at 02:36 Shanghai time", () => {
    expect(getCoachGreeting("2026-08-07T18:36:00.000Z")).toBe("夜还很静");
  });

  it("uses the weekend morning greeting in Shanghai time", () => {
    expect(getCoachGreeting("2026-08-08T00:30:00.000Z")).toBe("周末早上好");
  });

  it("keeps an evening greeting before the late-night period", () => {
    expect(getCoachGreeting("2026-08-07T14:59:00.000Z")).toBe("晚上好");
  });
```

The first timestamp is Friday 02:36 in Shanghai; the second is Saturday 02:36; the third is Saturday 08:30. Remove the previous expectation for `凌晨好` because that product copy is no longer desired.

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run tests/coach-greeting.test.ts
```

Expected: the weekday and weekend early-morning assertions fail because the current function neither detects weekend nor returns the approved short copy.

- [ ] **Step 3: Implement the minimal shared rule**

In `mini-program/src/features/coach/server-time.ts`, add a private Shanghai weekday helper using the same fixed UTC+8 conversion as the existing hour helper:

```ts
function getShanghaiDay(date: Date): number {
  const shanghai = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shanghai.getUTCDay();
}

function isShanghaiWeekend(date: Date): boolean {
  const day = getShanghaiDay(date);
  return day === 0 || day === 6;
}
```

Then replace the hour branching in `getCoachGreeting` with:

```ts
  const hour = getShanghaiHour(date);
  const weekend = isShanghaiWeekend(date);

  if (hour < 1 || hour >= 23) return weekend ? "夜色正静" : "夜深了";
  if (hour < 5) return weekend ? "夜还很静" : "还没休息";
  if (hour < 11) return weekend ? "周末早上好" : "早上好";
  if (hour < 14) return "中午好";
  if (hour < 18) return "下午好";
  return "晚上好";
```

Do not embed the nickname or punctuation in this helper. Existing page JSX remains responsible for displaying the nickname, preserving its current layout and fallback behavior.

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run tests/coach-greeting.test.ts
```

Expected: all greeting tests pass, including `02:36` on weekday and weekend.

- [ ] **Step 5: Commit the focused implementation**

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
git add mini-program/src/features/coach/server-time.ts mini-program/tests/coach-greeting.test.ts
git commit -m "feat: contextualize coach greetings"
```

### Task 2: Verify both consumers and the Mini Program build

**Files:**
- Verify: `mini-program/src/pages/home/index.tsx`
- Verify: `mini-program/src/pages/coach/index.tsx`
- Verify: `mini-program/tests/insight-api-boundary.test.ts`
- Verify: `mini-program/tests/coach-api-boundary.test.ts`

- [ ] **Step 1: Verify the two pages retain the shared helper boundary**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
rg -n "getCoachGreeting" src/pages/home/index.tsx src/pages/coach/index.tsx
```

Expected: both pages import and call `getCoachGreeting`; neither adds its own time or weekend branch.

- [ ] **Step 2: Run the complete unit suite**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run
```

Expected: all tests pass.

- [ ] **Step 3: Run typecheck and WeChat build**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm run typecheck
pnpm run build:weapp
```

Expected: TypeScript completes with no errors and Taro emits the WeChat Mini Program build. If the host prints the known macOS `system-configuration` warning while returning exit code 0, record it separately from a compilation error.

- [ ] **Step 4: Manually verify the compact presentation in WeChat DevTools or on-device**

Test Shanghai-time fixtures or a device clock override for the following:

```text
Friday 02:36  -> 首页和教练均为“还没休息，{昵称}”
Saturday 02:36 -> 首页和教练均为“夜还很静，{昵称}”
Saturday 08:30 -> 首页和教练均为“周末早上好，{昵称}”
Friday 12:00  -> 首页和教练均为“中午好，{昵称}”
Friday 20:00  -> 首页和教练均为“晚上好，{昵称}”
```

Expected: the greeting remains on one line and does not change existing avatar, nickname, target, or NOVA-card sizing.

- [ ] **Step 5: Commit verification-only updates if any were required**

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
git diff --check
git status --short
```

Expected: only the intended greeting files are staged or committed; unrelated local changes remain untouched.
