import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const wxssPath = resolve(root, "mini-program", "dist", "weapp", "app.wxss");
assert.ok(existsSync(wxssPath), "dist/weapp/app.wxss is missing; run build:weapp first");
const wxss = readFileSync(wxssPath, "utf8");

for (const token of ["@layer", "@apply", "@property", ":root", "@supports", "@container", "@media"]) {
  assert.equal(wxss.includes(token), false, `unsupported WXSS token found: ${token}`);
}
assert.equal(/(?:^|[{}])\s*\*(?=[:{,])/.test(wxss), false, "unsupported universal selector found");

console.log("WXSS compatibility check passed");
