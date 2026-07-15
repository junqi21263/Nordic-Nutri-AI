import { Input, Text, View } from "@tarojs/components";
export function SearchBar({
  placeholder = "搜索饮食记录",
  value = "",
  onInput,
  onClear,
}: {
  placeholder?: string;
  value?: string;
  onInput?: (value: string) => void;
  onClear?: () => void;
}) {
  return (
    <View className="search-bar">
      <Text className="search-bar__icon">⌕</Text>
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
          ×
        </View>
      ) : null}
    </View>
  );
}
