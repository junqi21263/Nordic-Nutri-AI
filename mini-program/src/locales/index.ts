import i18n, { getLocale } from "../i18n";
import type { AppLocale, LocaleMessages } from "./types";

export type { AppLocale, LocaleMessages } from "./types";

export const defaultLocale: AppLocale = "en";

/** Compatibility adapter for the existing typed onboarding composition. */
export function getLocaleMessages(locale: AppLocale = getLocale()): LocaleMessages {
  return {
    onboarding: i18n.getFixedT(locale)("onboarding", { returnObjects: true }) as LocaleMessages["onboarding"],
  };
}
