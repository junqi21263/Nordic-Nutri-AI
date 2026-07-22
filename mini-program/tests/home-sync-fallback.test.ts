import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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
});
