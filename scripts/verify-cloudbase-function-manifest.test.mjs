import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("production manifest excludes Dev-only workers", async () => {
  const manifest = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const names = manifest.functions.map((entry) => entry.name);
  assert.equal(manifest.envId, "lewis-healthy-d4glgqqzv73a5bc10");
  assert.equal(names.includes("hunyuan-image-worker"), false);
  assert.equal(names.includes("nutrition-insight-worker"), false);
  assert.equal(names.includes("nordic-ai-worker-prod"), false);
});

test("CloudBase manifest declares the Phase 2 vision foundation functions", async () => {
  const manifest = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const entries = new Map(manifest.functions.map((entry) => [entry.name, entry]));

  assert.deepEqual(entries.get("vision-analysis-dispatcher"), {
    name: "vision-analysis-dispatcher",
    type: "Event",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: true,
    triggers: [{ name: "vision-analysis-dispatcher-every-5-seconds", type: "timer", config: "*/5 * * * * * *" }],
    ignore: ["*.test.mjs", ".git/**"],
  });
  assert.deepEqual(entries.get("vision-analysis-worker"), {
    name: "vision-analysis-worker",
    type: "Event",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: true,
    ignore: ["*.test.mjs", ".git/**"],
  });
  assert.deepEqual(entries.get("vision-analysis-reaper"), {
    name: "vision-analysis-reaper",
    type: "Event",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: false,
    triggers: [{ name: "vision-analysis-reaper-every-minute", type: "timer", config: "0 * * * * * *" }],
    ignore: ["*.test.mjs", ".git/**"],
  });
});
