import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { computeNormalizedArtifact } from "./production-artifact.mjs";

test("normalized artifact excludes tests and node_modules and is stable", async () => {
  const root = await mkdtemp(join(tmpdir(), "nordic-artifact-"));
  try {
    await writeFile(join(root, "index.js"), "module.exports = 1;\n");
    await writeFile(join(root, "index.test.mjs"), "should not ship\n");
    await writeFile(join(root, "ignored.txt"), "ignored\n");
    const first = await computeNormalizedArtifact({ root, ignore: ["*.test.mjs", "ignored.txt"] });
    const second = await computeNormalizedArtifact({ root, ignore: ["*.test.mjs", "ignored.txt"] });
    assert.equal(first.sha256, second.sha256);
    assert.deepEqual(first.files, [{ path: "index.js", bytes: 20 }]);
    assert.equal(first.ignore.includes("*.test.mjs"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
