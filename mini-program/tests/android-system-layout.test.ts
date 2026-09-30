import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const pageLayout = readFileSync(resolve(import.meta.dirname, "../src/layouts/page-layout/index.tsx"), "utf8");
const components = readFileSync(resolve(import.meta.dirname, "../src/styles/components.scss"), "utf8");
const layout = readFileSync(resolve(import.meta.dirname, "../src/styles/layout.scss"), "utf8");
const composer = readFileSync(resolve(import.meta.dirname, "../src/pages/coach/components/CoachComposer/index.scss"), "utf8");
const tabBar = readFileSync(resolve(import.meta.dirname, "../src/components/bottom-tab-bar/index.tsx"), "utf8");

it("shares runtime Android bottom insets with fixed navigation and coach UI", () => {
  expect(pageLayout).toContain("style={cssVars}");
  expect(components).toContain("var(--app-safe-bottom");
  expect(components).toContain("var(--app-tab-bar-height");
  expect(layout).toContain("var(--app-safe-bottom");
  expect(composer).toContain("box-sizing: border-box");
});

it("keeps the tab bar and coach composer aligned to the same runtime bottom inset", () => {
  expect(components.match(/\.bottom-tab-bar\s*\{[\s\S]*?\n\}/)?.[0]).toContain("bottom: 0;");
  expect(tabBar).toContain("const layout = useSystemLayout();");
  expect(tabBar).toContain("height: `calc(${layout.tabBarHeight}px + ${layout.safeBottom}px)`");
  expect(tabBar).toContain("paddingBottom: `${layout.safeBottom}px`");
  expect(pageLayout).toContain('className?.split(/\\s+/).includes("page-layout--coach-chat")');
  expect(pageLayout).toContain("layout.tabBarHeight + layout.safeBottom + 56");
  expect(composer).toContain("min-height: 104px");
});
