import { Input, View } from "@tarojs/components";
import type { ReactNode } from "react";
import { NordicIcon } from "../nordic-icon";

export function SearchBar({
  placeholder = "搜索饮食记录",
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
  return (
    <View className={`search-bar ${trailing ? "search-bar--with-trailing" : ""}`}>
      <NordicIcon name="search" size={28} ariaLabel="搜索" />
      <Input
        className="search-bar__input"
        value={value}
        placeholder={placeholder}
        adjustPosition
        ariaLabel={placeholder}
        onInput={(event) => onInput?.(event.detail.value)}
      />
      {value ? (
        <View className="search-bar__clear" ariaLabel="清除搜索" onClick={onClear}>
          <NordicIcon name="x" size={20} ariaLabel="清除" />
        </View>
      ) : null}
      {trailing ? <View className="search-bar__trailing">{trailing}</View> : null}
    </View>
  );
}
