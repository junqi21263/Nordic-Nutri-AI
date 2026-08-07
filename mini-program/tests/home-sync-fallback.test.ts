import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveHomeDailySummary } from "../src/features/meals/home-daily-summary";

const homePage = readFileSync(resolve(import.meta.dirname, "../src/pages/home/index.tsx"), "utf8");

describe("home remote meal synchronization fallback", () => {
  it("keeps the established home layout and cached meals when a background sync fails", () => {
    const failureHandler = homePage.slice(
      homePage.indexOf(".catch(() =>"),
      homePage.indexOf("}, [", homePage.indexOf(".catch(() =>")),
    );

    expect(homePage).toContain("const [syncError, setSyncError]");
    expect(homePage).toContain('className="home-page__sync-note"');
    expect(homePage).toContain("setRefreshVersion((version) => version + 1)");
    expect(failureHandler).not.toContain("replaceRemoteMeals");
    expect(failureHandler).not.toContain("setErrorState");
  });

  it("refreshes the cloud summary when the home tab becomes visible again", () => {
    expect(homePage).toContain("useDidShow");
    expect(homePage).toContain("isOnboardingCompleted");
    expect(homePage).toMatch(/useDidShow\(\(\) => \{[\s\S]*setRefreshVersion/);
    expect(homePage).toContain("resolveHomeDailySummary");
  });

  it("evaluates pending achievements whenever the completed onboarding returns to Home", () => {
    expect(homePage).toContain("evaluateProductAchievements");
    expect(homePage).toContain("void evaluateProductAchievements(today)");
  });

  it("prefers local intake when the cached remote summary is still empty", () => {
    const remote = {
      calories: 2450,
      protein: 150,
      carbs: 280,
      fat: 80,
      consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      completion: 0,
    };
    const local = {
      calories: 2000,
      protein: 120,
      carbs: 220,
      fat: 70,
      consumed: { calories: 658, protein: 54, carbs: 40, fat: 28 },
      completion: 33,
    };

    const resolved = resolveHomeDailySummary(remote, local);
    expect(resolved.calories).toBe(2450);
    expect(resolved.consumed).toEqual(local.consumed);
    expect(resolved.staleRemote).toBe(true);
  });
});
