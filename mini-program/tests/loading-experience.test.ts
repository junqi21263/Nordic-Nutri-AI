import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../src");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("loading experience", () => {
  it("uses the compact loading animation instead of a large loading title", () => {
    const component = read("components/loading-state/index.tsx");
    expect(component).toContain('import { Loading } from "../loading"');
    expect(component).toContain("<Loading label={label} />");
    expect(component).not.toContain('className="state__title"');
  });

  it("keeps the frequent-meal editor layout while loading", () => {
    const page = read("pages/frequent-meal-edit/index.tsx");
    expect(page).toContain("FrequentMealEditSkeleton");
    expect(page).toContain("template-editor__loading");
  });

  it("keeps the journey layout while loading", () => {
    const page = read("pages/milestone-journey/index.tsx");
    expect(page).toContain("MilestoneJourneySkeleton");
    expect(page).toContain("milestone-journey-page__skeleton");
  });

  it("keeps the recent-frequent module height while loading", () => {
    const component = read("components/recent-frequent-meals/index.tsx");
    expect(component).toContain("recent-frequent__skeleton");
    expect(component).not.toContain('className="recent-frequent__meta">正在整理最近常吃');
  });
});
