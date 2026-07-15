import { Button, Text, View } from "@tarojs/components";

export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PageHeader({ title, subtitle, eyebrow, actionLabel, onAction }: PageHeaderProps) {
  return (
    <View className="page-header">
      <View>
        {eyebrow ? <Text className="page-header__eyebrow">{eyebrow}</Text> : null}
        <Text className="page-header__title">{title}</Text>
        {subtitle ? <Text className="page-header__subtitle">{subtitle}</Text> : null}
      </View>
      {actionLabel ? (
        <Button className="app-button app-button--ghost app-button--small" onClick={onAction}>
          {actionLabel}
        </Button>
      ) : null}
    </View>
  );
}
