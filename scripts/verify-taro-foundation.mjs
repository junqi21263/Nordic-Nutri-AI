import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const miniProgram = resolve(root, "mini-program");

function read(relativePath) {
  return readFileSync(resolve(miniProgram, relativePath), "utf8");
}

test("Taro React project exposes its required entrypoints and scripts", () => {
  for (const file of [
    "config/index.ts",
    "config/dev.ts",
    "config/prod.ts",
    "babel.config.cjs",
    "src/app.tsx",
    "src/index.html",
    "src/app.config.ts",
    "src/app.scss",
    "project.config.json",
    "project.private.config.json.example",
  ]) {
    assert.ok(existsSync(resolve(miniProgram, file)), file);
  }

  const pkg = JSON.parse(read("package.json"));
  for (const script of ["dev:weapp", "build:weapp", "build:h5", "typecheck", "lint"]) {
    assert.ok(pkg.scripts?.[script], script);
  }
  assert.match(read("config/index.ts"), /dist\/weapp/);
  assert.match(read("project.config.json"), /dist\/weapp/);
});

test("Taro foundation has design tokens, shared components, pages, and state boundaries", () => {
  assert.match(read("src/styles/tokens.scss"), /\$color-forest-green/);
  assert.match(read("src/app.tsx"), /QueryClientProvider/);

  for (const component of [
    "app-button",
    "app-card",
    "page-header",
    "macro-progress",
    "nutrition-card",
    "meal-card",
    "ai-insight-card",
    "loading-state",
    "empty-state",
    "error-state",
    "bottom-tab-bar",
  ]) {
    assert.ok(existsSync(resolve(miniProgram, `src/components/${component}/index.tsx`)), component);
  }

  for (const page of [
    "onboarding",
    "body-profile",
    "nutrition-plan",
    "home",
    "food-scanner",
    "analysis-result",
    "portion-adjustment",
    "meal-detail",
    "meal-records",
    "coach",
    "profile",
  ]) {
    assert.ok(existsSync(resolve(miniProgram, `src/pages/${page}/index.tsx`)), page);
  }

  for (const store of [
    "session-store.ts",
    "profile-store.ts",
    "onboarding-draft-store.ts",
    "daily-nutrition-store.ts",
    "analysis-task-store.ts",
  ]) {
    assert.ok(existsSync(resolve(miniProgram, `src/stores/${store}`)), store);
  }
});

test("mini program source has no privileged keys or business integrations", () => {
  const forbidden = /service_role|wechat_app_secret|openai_api_key|deepseek_api_key|wx\.login/i;
  const authSource = read("src/api/supabase-client.ts") + read("src/services/auth/login.ts");
  assert.doesNotMatch(authSource, forbidden);
  assert.match(read("src/api/supabase-client.ts"), /supabasePublishableKey/);
});
