import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

const DEFAULT_IGNORES = ["*.test.mjs", "node_modules/**", ".git/**"];

function globToRegExp(pattern) {
  const escaped = String(pattern)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DOUBLE_STAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLE_STAR§/g, ".*");
  return new RegExp(`^${escaped}$`);
}

function isIgnored(filePath, patterns) {
  const normalized = filePath.split(sep).join("/");
  return patterns.some((pattern) => {
    const value = String(pattern || "").replace(/^\.\//, "");
    return globToRegExp(value).test(normalized) || globToRegExp(`**/${value}`).test(normalized);
  });
}

async function collectFiles(root, current = root, patterns = DEFAULT_IGNORES) {
  const entries = await readdir(current, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(current, entry.name);
    const relativePath = relative(root, absolute).split(sep).join("/");
    if (isIgnored(relativePath, patterns)) continue;
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, absolute, patterns));
    } else if (entry.isFile()) {
      files.push({ path: relativePath, bytes: await readFile(absolute) });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

export async function computeNormalizedArtifact({ root, ignore = DEFAULT_IGNORES } = {}) {
  if (!root) throw new Error("ARTIFACT_ROOT_REQUIRED");
  const files = await collectFiles(root, root, ignore);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(file.path);
    hash.update("\0");
    hash.update(String(file.bytes.byteLength));
    hash.update("\0");
    hash.update(file.bytes);
    hash.update("\0");
  }
  return {
    sha256: hash.digest("hex"),
    files: files.map(({ path, bytes }) => ({ path, bytes: bytes.byteLength })),
    ignore: [...ignore],
  };
}

export { DEFAULT_IGNORES };
