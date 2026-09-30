import { expect } from "vitest";
import zhCN from "../src/i18n/locales/zh-CN.json";
import zhTW from "../src/i18n/locales/zh-TW.json";
import en from "../src/i18n/locales/en.json";

function flatten(value: unknown, prefix = ""): Array<{ key: string; text: string }> {
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([part, child]) => {
    const key = prefix ? `${prefix}.${part}` : part;
    return typeof child === "string"
      ? [{ key, text: child }]
      : flatten(child, key);
  });
}

const translations = flatten(zhCN);

export function expectTranslationKey(source: string, key: string) {
  const escapedKey = key.replaceAll(".", "\\.");
  expect(new RegExp(`\\bt\\s*\\(\\s*["']${escapedKey}["']`).test(source), `source should use ${key}`).toBe(true);
  for (const [locale, resources] of [["zh-CN", zhCN], ["zh-TW", zhTW], ["en", en]] as const) {
    const entry = flatten(resources).find((item) => item.key === key);
    expect(entry?.text.trim(), `${locale} should translate ${key}`).toBeTruthy();
  }
}

/** Assert migrated UI copy lives in the locale catalog and the source uses its semantic key. */
export function expectLocalizedCopy(source: string, copy: string) {
  const keys = translations
    .filter(({ text }) => text.includes(copy))
    .map(({ key }) => key);
  expect(keys.length, `zh-CN locale should contain: ${copy}`).toBeGreaterThan(0);
  expect(
    keys.some((key) => {
      const direct = new RegExp(`\\bt\\s*\\(\\s*["']${key.replaceAll(".", "\\.")}["']`).test(source);
      const dynamicIndex = key.match(/^(.*)\.(\d+)\.(.*)$/);
      const dynamic = dynamicIndex
        ? source.includes("t(`" + dynamicIndex[1] + ".${index}." + dynamicIndex[3] + "`)")
        : false;
      return direct || dynamic;
    }),
    `source should use a translation key for: ${copy}`,
  ).toBe(true);
}
