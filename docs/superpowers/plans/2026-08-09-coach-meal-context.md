# NOVA 餐次状态首卡 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the NOVA coach hero immediately change its state copy and CTA after breakfast, lunch, or dinner is saved, using actual meal types and daily nutrition completion without adding weather or location functionality.

**Architecture:** Add a pure `coach-meal-context` domain function that receives today’s meals, nutrition summary, and current hour and returns one concise hero state. The coach page consumes that state instead of rendering the daily API brief’s stale summary/suggestion directly. `dailyBrief.greeting` remains the greeting source; the existing daily-tip and chat features remain unchanged.

**Tech Stack:** TypeScript, Taro React, Zustand meal store, Vitest.

---

### Task 1: Define and test the pure meal-context decision table

**Files:**
- Create: `mini-program/src/features/coach/meal-context.ts`
- Create: `mini-program/tests/coach-meal-context.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `mini-program/tests/coach-meal-context.test.ts` with a minimal meal factory and these tests:

```ts
import { describe, expect, it } from "vitest";
import { createCoachMealContext } from "../src/features/coach/meal-context";
import { localDailyTargets, type Meal } from "../src/features/meals/domain";

const today = "2026-08-09";

function meal(mealType: Meal["mealType"]): Meal {
  return {
    id: mealType,
    date: today,
    time: "12:00",
    title: mealType,
    mealType,
    favorite: false,
    imageKey: null,
    insight: "",
    items: [{ id: mealType, name: mealType, amount: "1份", calories: 300, protein: 20, carbs: 30, fat: 10 }],
  };
}

const summary = (consumed: Partial<typeof localDailyTargets> = {}) => ({
  ...localDailyTargets,
  consumed: { calories: 0, protein: 0, carbs: 0, fat: 0, ...consumed },
  completion: 0,
});

describe("coach meal context", () => {
  it("asks for lunch after breakfast has been recorded during lunch time", () => {
    expect(createCoachMealContext({ meals: [meal("breakfast")], summary: summary(), hour: 12 })).toMatchObject({
      summary: "早餐已记录",
      suggestion: "今日行动：午餐还没记录，按自己的节奏补上。",
      ctaLabel: "记录午餐",
      ctaAction: "record",
    });
  });

  it("asks for dinner after breakfast and lunch have been recorded", () => {
    expect(createCoachMealContext({ meals: [meal("breakfast"), meal("lunch")], summary: summary(), hour: 18 })).toMatchObject({
      suggestion: "今日行动：晚餐还差一餐，继续完成今天节奏。",
      ctaLabel: "记录晚餐",
    });
  });

  it("uses a breakfast make-up action after lunch is recorded without breakfast", () => {
    expect(createCoachMealContext({ meals: [meal("lunch")], summary: summary(), hour: 14 })).toMatchObject({
      suggestion: "今日行动：早餐可按需补记。",
      ctaLabel: "补记早餐",
    });
  });

  it("shows nutrition completion after all three meals are recorded", () => {
    expect(
      createCoachMealContext({
        meals: [meal("breakfast"), meal("lunch"), meal("dinner")],
        summary: summary({ protein: 80, calories: 1_000 }),
        hour: 20,
      }),
    ).toMatchObject({
      summary: "三餐已记录",
      suggestion: "今日行动：晚间可补一份优质蛋白，帮助完成目标。",
      ctaLabel: "查看今日进度",
      ctaAction: "progress",
    });
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run tests/coach-meal-context.test.ts
```

Expected: test collection fails because `coach-meal-context.ts` does not yet exist.

- [ ] **Step 3: Implement the minimal decision function**

Create `mini-program/src/features/coach/meal-context.ts`:

```ts
import type { DailySummary, Meal, MealType } from "../meals/domain";

export type CoachMealContext = {
  summary: string;
  suggestion: string;
  ctaLabel: string;
  ctaAction: "record" | "progress";
  mealType: MealType | null;
};

type CreateCoachMealContextInput = {
  meals: Meal[];
  summary: DailySummary;
  hour: number;
};

const mainMealTypes: MealType[] = ["breakfast", "lunch", "dinner"];

function hasMealType(meals: Meal[], mealType: MealType) {
  return meals.some((meal) => meal.mealType === mealType);
}

function getAllMealsRecordedContext(summary: DailySummary): CoachMealContext {
  if (summary.consumed.protein < summary.protein * 0.8) {
    return {
      summary: "三餐已记录",
      suggestion: "今日行动：晚间可补一份优质蛋白，帮助完成目标。",
      ctaLabel: "查看今日进度",
      ctaAction: "progress",
      mealType: null,
    };
  }
  if (summary.consumed.calories < summary.calories * 0.75) {
    return {
      summary: "三餐已记录",
      suggestion: "今日行动：今日摄入偏少，可适当补足主食与蛋白。",
      ctaLabel: "查看今日进度",
      ctaAction: "progress",
      mealType: null,
    };
  }
  return {
    summary: "三餐已记录",
    suggestion: "今日行动：今天的营养节奏不错，继续保持。",
    ctaLabel: "查看今日进度",
    ctaAction: "progress",
    mealType: null,
  };
}

export function createCoachMealContext({ meals, summary, hour }: CreateCoachMealContextInput): CoachMealContext {
  const recorded = new Set(mainMealTypes.filter((mealType) => hasMealType(meals, mealType)));
  if (recorded.size === mainMealTypes.length) return getAllMealsRecordedContext(summary);

  if (recorded.has("lunch") && !recorded.has("breakfast")) {
    return {
      summary: "午餐已记录",
      suggestion: "今日行动：早餐可按需补记。",
      ctaLabel: "补记早餐",
      ctaAction: "record",
      mealType: "breakfast",
    };
  }
  if (recorded.has("breakfast") && !recorded.has("lunch")) {
    return {
      summary: "早餐已记录",
      suggestion: "今日行动：午餐还没记录，按自己的节奏补上。",
      ctaLabel: "记录午餐",
      ctaAction: "record",
      mealType: "lunch",
    };
  }
  if (recorded.has("breakfast") && recorded.has("lunch") && !recorded.has("dinner")) {
    return {
      summary: "已完成两餐记录",
      suggestion: "今日行动：晚餐还差一餐，继续完成今天节奏。",
      ctaLabel: "记录晚餐",
      ctaAction: "record",
      mealType: "dinner",
    };
  }
  const nextMealType: MealType = hour >= 17 ? "dinner" : hour >= 11 ? "lunch" : "breakfast";
  return {
    summary: "今天还没有餐次记录",
    suggestion: "今日行动：今天先完成第一餐记录。",
    ctaLabel: "记录第一餐",
    ctaAction: "record",
    mealType: nextMealType,
  };
}
```

`hour` is accepted to keep decisions deterministic in tests. Do not derive it from the device clock in this domain file.

- [ ] **Step 4: Run the new test and verify it passes**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run tests/coach-meal-context.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the domain behavior**

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
git add mini-program/src/features/coach/meal-context.ts mini-program/tests/coach-meal-context.test.ts
git commit -m "feat: derive coach meal context"
```

### Task 2: Render derived context in the NOVA hero and progress card

**Files:**
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/tests/coach-proactive-daily-brief.test.ts`

- [ ] **Step 1: Add a failing integration-boundary assertion**

Append this assertion to `mini-program/tests/coach-proactive-daily-brief.test.ts`:

```ts
    expect(page).toContain("createCoachMealContext");
    expect(page).toContain("heroContext.summary");
    expect(page).toContain("heroContext.suggestion");
```

- [ ] **Step 2: Run the integration-boundary test and verify it fails**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run tests/coach-proactive-daily-brief.test.ts
```

Expected: failure because the page still renders `dailyBrief.summary` and `dailyBrief.suggestion` directly.

- [ ] **Step 3: Wire the derived context into the page**

In `mini-program/src/pages/coach/index.tsx`:

1. Import `createCoachMealContext` from `../../features/coach/meal-context`.
2. Move the existing `const [serverTime, setServerTime] = useState<string | null>(null);` state declaration above the derived hero context so it is initialized before use. Remove its former declaration later in the state list.
3. Replace `hasMealRecord` and `primaryActionLabel` with:

```ts
  const todayMeals = meals.getMealsByDate(date);
  const heroContext = createCoachMealContext({
    meals: todayMeals,
    summary,
    hour: serverTime ? new Date(new Date(serverTime).getTime() + 8 * 60 * 60 * 1000).getUTCHours() : new Date().getHours(),
  });
```

4. Render `heroContext.summary` and `heroContext.suggestion` in the hero in place of `dailyBrief.summary` and `dailyBrief.suggestion`; continue rendering `dailyBrief.greeting`.
5. Use `heroContext.ctaLabel` for the CTA label and accessibility text.
6. Change `handlePrimaryAction` to:

```ts
  const handlePrimaryAction = () => {
    if (heroContext.ctaAction === "progress") {
      setExpandedSections((current) => ({ ...current, progress: true }));
      void Taro.pageScrollTo({ selector: "#coach-progress", duration: 300 });
      return;
    }
    void Taro.switchTab({ url: "/pages/meal-records/index" });
  };
```

7. Add `id="coach-progress"` to the progress card root. Replace the two `hasMealRecord` display branches with `heroContext.ctaAction === "progress"` and `heroContext.summary`, so the collapsed progress card is consistent with the hero.

Do not add a weather row, location calls, API calls, new cards, or changes to the existing hero CSS.

- [ ] **Step 4: Run the integration-boundary test and verify it passes**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run tests/coach-proactive-daily-brief.test.ts
```

Expected: all assertions pass.

- [ ] **Step 5: Commit the page wiring**

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
git add mini-program/src/pages/coach/index.tsx mini-program/tests/coach-proactive-daily-brief.test.ts
git commit -m "feat: refresh coach action after meal records"
```

### Task 3: Verify behavior and prevent scope expansion

**Files:**
- Verify: `mini-program/src/pages/coach/index.tsx`
- Verify: `mini-program/src/pages/manual-meal/index.tsx`
- Verify: `mini-program/src/pages/analysis-result/index.tsx`

- [ ] **Step 1: Verify saved meals update the shared meal store**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
rg -n "replaceRemoteMeals\(await getProductMeals" mini-program/src/pages/manual-meal/index.tsx mini-program/src/pages/analysis-result/index.tsx mini-program/src/pages/portion-adjustment/index.tsx
```

Expected: all supported save flows refresh the store from remote meals before the user returns to the coach tab.

- [ ] **Step 2: Run the complete Mini Program test suite**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm vitest run
```

Expected: all test files pass.

- [ ] **Step 3: Run typecheck and WeChat build**

Run:

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI/mini-program
pnpm run typecheck
pnpm run build:weapp
```

Expected: no TypeScript errors and a completed WeChat build. Record the host macOS `system-configuration` warning separately if it appears with exit code 0.

- [ ] **Step 4: Perform on-device or DevTools acceptance checks**

```text
无餐次：首卡为“记录第一餐”
仅早餐：首卡为“记录午餐”
早餐+午餐：首卡为“记录晚餐”
仅午餐：首卡为“补记早餐”
三餐完成且蛋白不足：首卡 CTA 为“查看今日进度”，展开进度并显示蛋白行动
```

Expected: 每次保存并返回教练页后，首卡与进度卡即时同步；没有天气入口、定位授权或新增卡片。

- [ ] **Step 5: Final diff check and commit only intended files**

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
git diff --check
git status --short
```

Expected: 本次提交不包含天气、定位、权限或供应商密钥相关文件；既有未提交页面和样式修改不被覆盖。
