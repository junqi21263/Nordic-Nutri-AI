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
