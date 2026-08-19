import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("CloudBase manifest declares every HTTP worker used by get-login-ticket", async () => {
  const manifest = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const worker = manifest.functions.find((entry) => entry.name === "hunyuan-image-worker");

  assert.deepEqual(worker, {
    name: "hunyuan-image-worker",
    type: "HTTP",
    timeout: 900,
    runtime: "Nodejs18.15",
    installDependency: true,
    ignore: ["*.test.mjs", ".git/**"],
  });
});

test("CloudBase manifest declares the Phase 2 vision foundation functions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const entries = new Map(manifest.functions.map((entry) => [entry.name, entry]));

  assert.deepEqual(entries.get("vision-analysis-dispatcher"), {
    name: "vision-analysis-dispatcher",
    type: "HTTP",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: true,
    triggers: [{ name: "vision-analysis-dispatcher-every-15-seconds", type: "timer", config: "*/15 * * * * * *" }],
    ignore: ["*.test.mjs", ".git/**"],
  });
  assert.deepEqual(entries.get("vision-analysis-worker"), {
    name: "vision-analysis-worker",
    type: "HTTP",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: true,
    ignore: ["*.test.mjs", ".git/**"],
  });
  assert.deepEqual(entries.get("vision-analysis-reaper"), {
    name: "vision-analysis-reaper",
    type: "HTTP",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: false,
    triggers: [{ name: "vision-analysis-reaper-every-minute", type: "timer", config: "0 * * * * * *" }],
    ignore: ["*.test.mjs", ".git/**"],
  });
});
