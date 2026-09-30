import Taro from "@tarojs/taro";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";
import { resolveLocale, supportedLocales, type AppLocale, type LanguagePreference } from "./locale";

const storageKey = "nordic.language";
export function getLanguagePreference(): LanguagePreference {
  try {
    const value = Taro.getStorageSync(storageKey);
    return supportedLocales.includes(value) ? value : "system";
  } catch { return "system"; }
}
function systemLanguage(): string {
  if (process.env.TARO_ENV === "h5" && typeof navigator !== "undefined" && navigator.language) return navigator.language;
  try {
    const language = Taro.getAppBaseInfo()?.language || Taro.getSystemInfoSync()?.language;
    if (language) return language;
  } catch { /* Native shell or older Taro runtime. */ }
  return typeof navigator === "undefined" ? "en" : navigator.language || "en";
}
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, "zh-CN": { translation: zhCN }, "zh-TW": { translation: zhTW } },
  lng: resolveLocale(getLanguagePreference(), systemLanguage()),
  fallbackLng: "en",
  supportedLngs: [...supportedLocales],
  load: "currentOnly",
  initAsync: false,
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});
export function getLocale(): AppLocale {
  return resolveLocale(i18n.resolvedLanguage, "en");
}
export function getSystemLocale(): AppLocale {
  return resolveLocale("system", systemLanguage());
}
export async function refreshSystemLanguage() {
  if (getLanguagePreference() === "system") await i18n.changeLanguage(resolveLocale("system", systemLanguage()));
}
export async function setLanguagePreference(preference: LanguagePreference) {
  Taro.setStorageSync(storageKey, preference);
  await i18n.changeLanguage(resolveLocale(preference, systemLanguage()));
}
export const t = i18n.t.bind(i18n);
export default i18n;
