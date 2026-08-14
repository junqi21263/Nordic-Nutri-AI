import { readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";

export const DEFAULT_WEAPP_PACKAGE_BUDGET_BYTES = 1_800_000;

async function directorySize(root) {
  const entries = await readdir(root, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) total += await directorySize(path);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

export async function verifyWeappSize({
  root = resolve(process.cwd(), "dist/weapp"),
  budgetBytes = DEFAULT_WEAPP_PACKAGE_BUDGET_BYTES,
} = {}) {
  const totalBytes = await directorySize(root);
  if (totalBytes > budgetBytes) {
    throw new Error(
      `微信小程序包体积超出安全预算：${totalBytes} bytes > ${budgetBytes} bytes（请压缩或迁移插画资源）`,
    );
  }
  return { root, totalBytes, budgetBytes };
}

if (process.argv[1] && new URL(import.meta.url).pathname === resolve(process.argv[1])) {
  const result = await verifyWeappSize();
  console.log(
    `WeChat package size OK: ${(result.totalBytes / 1024 / 1024).toFixed(3)} MiB / ${(result.budgetBytes / 1024 / 1024).toFixed(3)} MiB`,
  );
}
