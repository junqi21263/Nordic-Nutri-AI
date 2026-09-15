import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, it } from "vitest";

const app = readFileSync(resolve(import.meta.dirname, "../src/app.tsx"), "utf8");
const appStyles = readFileSync(resolve(import.meta.dirname, "../src/app.scss"), "utf8");
const welcome = readFileSync(resolve(import.meta.dirname, "../src/pages/welcome/index.tsx"), "utf8");
const home = readFileSync(resolve(import.meta.dirname, "../src/pages/home/index.tsx"), "utf8");
const authBootstrap = readFileSync(resolve(import.meta.dirname, "../src/auth/app-auth-bootstrap.ts"), "utf8");
const transition = readFileSync(resolve(import.meta.dirname, "../src/components/app-transition-overlay/index.tsx"), "utf8");
const transitionStyles = readFileSync(resolve(import.meta.dirname, "../src/components/app-transition-overlay/index.scss"), "utf8");

it("keeps a branded transition mounted across welcome-to-home navigation", () => {
  expect(app).toContain("AppTransitionOverlay");
  expect(welcome).toContain("showWelcomeTransition");
  expect(welcome).toContain("hideWelcomeTransition");
  expect(home).toContain("hideWelcomeTransition");
  expect(authBootstrap).toContain("finishWelcomeTransition");
  expect(appStyles).toContain('components/app-transition-overlay/index.scss');
});

it("uses the existing rhythmic loading language with readable transition copy", () => {
  expect(transition).toContain("app-transition-overlay__bars");
  expect(transition).not.toContain("app-transition-overlay__orbit");
  expect(transitionStyles).toContain("animation: app-transition-bar");
  expect(transitionStyles).toContain("font-size: 56px");
  expect(transitionStyles).toContain("font-size: 32px");
  expect(transitionStyles).toContain("height: 92px");
});
