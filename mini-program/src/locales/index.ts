import { enUS } from "./en-US";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";
import type { AppLocale, LocaleMessages, LocaleOverrides } from "./types";

export type { AppLocale, LocaleMessages } from "./types";

export const defaultLocale: AppLocale = "zh-CN";

const localeOverrides: Record<AppLocale, LocaleOverrides> = {
  "zh-CN": {},
  "zh-TW": zhTW,
  "en-US": enUS,
};

/** Resolves local copy without a remote translation dependency. */
export function getLocaleMessages(locale: AppLocale = defaultLocale): LocaleMessages {
  const override = localeOverrides[locale].onboarding;
  if (!override) return zhCN;

  return {
    onboarding: {
      ...zhCN.onboarding,
      ...override,
      goals: {
        ...zhCN.onboarding.goals,
        ...override.goals,
      },
    },
  };
}
