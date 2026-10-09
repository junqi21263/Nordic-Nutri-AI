import { View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useTranslation } from "react-i18next";
import { getLanguagePreference } from "../../i18n";
import type { AppLocale } from "../../i18n/locale";
import { NordicIcon } from "../nordic-icon";
import { ListItem } from "../list-item";

const localeNameKeys: Record<AppLocale, string> = {
  "zh-CN": "zhCN",
  "zh-TW": "zhTW",
  en: "en",
};

export function LanguageSettings() {
  const { t } = useTranslation();
  const preference = getLanguagePreference();
  const description =
    preference === "system"
      ? t("settings.followSystem")
      : t(`languageSettings.localeNames.${localeNameKeys[preference]}`);

  return (
    <View
      onClick={() => {
        void Taro.navigateTo({ url: "/pages/language-settings/index" });
      }}
    >
      <ListItem
        icon={<NordicIcon name="languages" size={20} ariaLabel={t("settings.language")} />}
        title={t("settings.language")}
        description={description}
      />
    </View>
  );
}
