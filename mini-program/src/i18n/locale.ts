export const supportedLocales = ["zh-CN", "zh-TW", "en"] as const;
export type AppLocale = typeof supportedLocales[number];
export type LanguagePreference = AppLocale | "system";

export function mapSystemLocale(language: unknown): AppLocale {
  const code = typeof language === "string" ? language.replace(/_/g, "-").toLowerCase() : "";
  if (/^zh-(tw|hk|mo|hant)(-|$)/.test(code)) return "zh-TW";
  if (/^zh-(cn|sg|hans)(-|$)/.test(code)) return "zh-CN";
  return "en";
}

export function resolveLocale(preference: unknown, systemLanguage: unknown): AppLocale {
  return supportedLocales.includes(preference as AppLocale)
    ? preference as AppLocale
    : mapSystemLocale(systemLanguage);
}
