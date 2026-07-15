import { Text, View } from "@tarojs/components";
import type { ReactNode } from "react";

export interface ListItemProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  trailing?: string;
}
export function ListItem({ icon = "◌", title, description, trailing = "›" }: ListItemProps) {
  return (
    <View className="list-item">
      <View className="list-item__leading">{icon}</View>
      <View className="list-item__content">
        <Text className="list-item__title">{title}</Text>
        {description ? <Text className="list-item__description">{description}</Text> : null}
      </View>
      <Text className="list-item__trailing">{trailing}</Text>
    </View>
  );
}
