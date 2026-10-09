import { describe, expect, it } from "vitest";
import { mapSystemLocale, resolveLocale } from "../src/i18n/locale";
import en from "../src/i18n/locales/en.json";
import zhCN from "../src/i18n/locales/zh-CN.json";
import zhTW from "../src/i18n/locales/zh-TW.json";

describe("language resolution", () => {
  it("honors a manual choice and maps supported system variants", () => {
    expect(resolveLocale("zh-TW", "en-US")).toBe("zh-TW");
    expect(resolveLocale("system", "zh-SG")).toBe("zh-CN");
    expect(mapSystemLocale("zh-Hans-CN")).toBe("zh-CN");
    expect(mapSystemLocale("zh-Hant-TW")).toBe("zh-TW");
    expect(mapSystemLocale("zh-HK")).toBe("zh-TW");
    expect(mapSystemLocale("zh-MO")).toBe("zh-TW");
    expect(mapSystemLocale("fr-FR")).toBe("en");
  });

  it("keeps semantic keys and interpolation parameters aligned across languages", () => {
    const flatten = (value: unknown, prefix = ""): Record<string, string> => {
      if (typeof value === "string") return { [prefix]: value };
      return Object.entries(value as Record<string, unknown>).reduce((result, [key, child]) => ({
        ...result, ...flatten(child, prefix ? `${prefix}.${key}` : key),
      }), {} as Record<string, string>);
    };
    const baseline = flatten(en);
    for (const resource of [zhCN, zhTW]) {
      const translated = flatten(resource);
      expect(Object.keys(translated).sort()).toEqual(Object.keys(baseline).sort());
      for (const [key, value] of Object.entries(baseline)) {
        expect([...value.matchAll(/{{(\w+)}}/g)].map((item) => item[1]).sort()).toEqual(
          [...translated[key].matchAll(/{{(\w+)}}/g)].map((item) => item[1]).sort(),
        );
      }
    }
  });
});
