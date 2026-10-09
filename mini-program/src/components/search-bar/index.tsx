import { Input, View } from "@tarojs/components";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { NordicIcon } from "../nordic-icon";

export function SearchBar({
  placeholder,
  value = "",
  onInput,
  onClear,
  trailing,
}: {
  placeholder?: string;
  value?: string;
  onInput?: (value: string) => void;
  onClear?: () => void;
  trailing?: ReactNode;
}) {
  const { t } = useTranslation();
  const resolvedPlaceholder = placeholder ?? t("sharedUi.searchPlaceholder");
  return (
    <View className={`search-bar ${trailing ? "search-bar--with-trailing" : ""}`}>
      <NordicIcon name="search" size={28} ariaLabel={t("sharedUi.searchAction")} />
      <Input
        className="search-bar__input"
        value={value}
        placeholder={resolvedPlaceholder}
        adjustPosition
        ariaLabel={resolvedPlaceholder}
        onInput={(event) => onInput?.(event.detail.value)}
      />
      {value ? (
        <View className="search-bar__clear" ariaLabel={t("sharedUi.clearSearch")} onClick={onClear}>
          <NordicIcon name="x" size={20} ariaLabel={t("common.clear")} />
        </View>
      ) : null}
      {trailing ? <View className="search-bar__trailing">{trailing}</View> : null}
    </View>
  );
}
