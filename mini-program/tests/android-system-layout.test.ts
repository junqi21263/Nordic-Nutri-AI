import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const pageLayout = readFileSync(resolve(import.meta.dirname, "../src/layouts/page-layout/index.tsx"), "utf8");
const components = readFileSync(resolve(import.meta.dirname, "../src/styles/components.scss"), "utf8");
const layout = readFileSync(resolve(import.meta.dirname, "../src/styles/layout.scss"), "utf8");
const composer = readFileSync(resolve(import.meta.dirname, "../src/pages/coach/components/CoachComposer/index.scss"), "utf8");

it("shares runtime Android bottom insets with fixed navigation and coach UI", () => {
  expect(pageLayout).toContain("style={cssVars}");
  expect(components).toContain("var(--app-safe-bottom");
  expect(components).toContain("var(--app-tab-bar-height");
  expect(layout).toContain("var(--app-safe-bottom");
  expect(composer).toContain("box-sizing: border-box");
});
